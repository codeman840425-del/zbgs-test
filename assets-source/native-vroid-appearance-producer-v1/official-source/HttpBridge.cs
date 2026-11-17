using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;

namespace VRoidMcpBridge;

/// <summary>
/// Petit serveur HTTP local (127.0.0.1 uniquement). Chaque route renvoie du JSON.
///
/// On n'utilise volontairement pas HttpListener : sous Wine/Proton, HTTP.sys
/// accepte la première requête puis ne répond plus (le pont semblait « en
/// écoute » mais restait muet). TcpListener + un parseur HTTP minimal fonctionne
/// avec le réseau de Wine et reste assez simple pour les requêtes du serveur MCP.
/// GET  /status
/// GET  /groups
/// GET  /params?group=ID
/// POST /set_blendshape {group, key, value}
/// POST /set_bone       {group, key, value}
/// POST /set_color      {group, key, r, g, b, a?}
/// POST /undo, /redo
/// POST /screenshot     {path?}
/// </summary>
public class HttpBridge
{
    readonly TcpListener _listener;
    Thread _thread;
    volatile bool _running;

    public HttpBridge(int port)
    {
        _listener = new TcpListener(IPAddress.Loopback, port);
    }

    public void Start()
    {
        _listener.Start();
        _running = true;
        _thread = new Thread(() => Loop().GetAwaiter().GetResult())
        {
            IsBackground = true,
            Name = "VRoidMcpBridge.Http",
        };
        _thread.Start();
    }

    public void Stop()
    {
        _running = false;
        try { _listener.Stop(); } catch { }
    }

    async Task Loop()
    {
        while (_running)
        {
            TcpClient client;
            try { client = await _listener.AcceptTcpClientAsync(); }
            catch
            {
                if (!_running) return;
                continue;
            }
            _ = Task.Run(() => HandleClient(client));
        }
    }

    static readonly JsonSerializerOptions Json = new() { WriteIndented = false };

    async Task HandleClient(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.NoDelay = true;
                using var stream = client.GetStream();
                var request = await ReadRequest(stream);
                object result;
                int code = 200;
                try
                {
                    JsonNode body = string.IsNullOrWhiteSpace(request.Body) ? null : JsonNode.Parse(request.Body);

                    string Q(string name) => request.Query.TryGetValue(name, out var v) ? v : body?[name]?.ToString();
                    float F(string name, float def = float.NaN)
                    {
                        var n = body?[name];
                        if (n != null) return n.GetValue<float>();
                        if (request.Query.TryGetValue(name, out var s))
                            return float.Parse(s, System.Globalization.CultureInfo.InvariantCulture);
                        if (float.IsNaN(def)) throw new ArgumentException($"missing parameter: {name}");
                        return def;
                    }

                    float? O(string name)
                    {
                        var n = body?[name];
                        if (n != null) return n.GetValue<float>();
                        if (request.Query.TryGetValue(name, out var s))
                            return float.Parse(s, System.Globalization.CultureInfo.InvariantCulture);
                        return null;
                    }

                    bool? B(string name) => Q(name) is { } v
                        ? string.Equals(v, "true", StringComparison.OrdinalIgnoreCase) || v == "1"
                        : null;
                    int? I(string name) => Q(name) is { } v
                        ? (int)Math.Round(double.Parse(v, System.Globalization.CultureInfo.InvariantCulture))
                        : null;

                    result = request.Path.TrimEnd('/') switch
                    {
                        // Répondu directement par le thread HTTP : utile quand le thread principal ne répond pas.
                        "/debug" => new
                        {
                            lastPumpUtc = MainThread.LastPumpUtc.ToString("o"),
                            lastPumpSource = MainThread.LastPumpSource,
                            secondsSinceLastPump = (DateTime.UtcNow - MainThread.LastPumpUtc).TotalSeconds,
                            pending = MainThread.Pending,
                            unityContext = MainThread.HasUnityContext,
                        },
                        "" or "/status" => await MainThread.Run(VRoidApi.Status),
                        "/selftest" => await MainThread.Run(VRoidApi.SelfTest),
                        "/groups" => await MainThread.Run(VRoidApi.Groups),
                        "/params" => await MainThread.Run(() => VRoidApi.Params(Q("group"))),
                        "/item_params" => await MainThread.Run(() => VRoidApi.ItemParameters(Q("type"))),
                        "/set_blendshape" => await MainThread.Run(() => VRoidApi.SetBlendShape(Q("group"), Q("key"), F("value"))),
                        "/set_bone" => await MainThread.Run(() => VRoidApi.SetBone(Q("group"), Q("key"), F("value"))),
                        "/set_color" => await MainThread.Run(() => VRoidApi.SetColor(Q("group"), Q("key"), F("r"), F("g"), F("b"), F("a", 1f))),
                        "/layers" => await MainThread.Run(() => Textures.Layers(Q("group"))),
                        "/export_layer" => await MainThread.Run(() => Textures.Export(Q("transferable"), Q("image"), Q("node"), Q("path"))),
                        "/import_layer" => await MainThread.Run(() => Textures.Import(Q("transferable"), Q("image"), Q("node"), Q("path"),
                            string.Equals(Q("as_new_layer"), "true", StringComparison.OrdinalIgnoreCase))),
                        "/recolor_layer" => await MainThread.Run(() => Textures.Recolor(Q("transferable"), Q("image"), Q("node"),
                            F("r"), F("g"), F("b"), Q("mode"), F("strength", 1f))),
                        "/hair_materials" => await MainThread.Run(Hair.Materials),
                        "/set_hair_color" => await MainThread.Run(() => Hair.SetColor(Q("material"), Q("key"), F("r"), F("g"), F("b"), F("a", 1f))),
                        "/hair_groups" => await MainThread.Run(HairShape.Groups),
                        "/hair_points" => await MainThread.Run(() => HairShape.Points(Q("transferable"), Q("group"), Q("strand"))),
                        "/hair_move_point" => await MainThread.Run(() => HairShape.MovePoint(Q("transferable"), Q("group"), Q("strand"),
                            (int)F("index"), F("x"), F("y"), F("z"),
                            O("nx") ?? float.NaN, O("ny") ?? float.NaN, O("nz") ?? float.NaN,
                            O("u") ?? float.NaN, O("v") ?? float.NaN)),
                        "/hair_duplicate_strand" => await MainThread.Run(() => HairShape.DuplicateStrand(Q("transferable"), Q("group"), Q("strand"),
                            F("dx", 0), F("dy", 0), F("dz", 0))),
                        "/hair_set_material" => await MainThread.Run(() => HairShape.SetMaterial(Q("transferable"), Q("group"), Q("strand"), Q("material"))),
                        "/hair_bones" => await MainThread.Run(() => HairShape.Bones(Q("transferable"))),
                        "/hair_set_bone" => await MainThread.Run(() => HairShape.SetBone(Q("transferable"), Q("group"),
                            (int)(I("bone_count") ?? -1), O("spring_root_rate") ?? float.NaN,
                            O("stiffness") ?? float.NaN, O("gravity") ?? float.NaN,
                            O("collider_radius") ?? float.NaN)),
                        "/set_procedural_hair" => await MainThread.Run(() => HairShape.SetProcedural(Q("transferable"), Q("group"),
                            F("length", -1f) is var l && l < 0 ? float.NaN : l, (int)F("hair_count", 0))),
                        "/scale_brush_hair" => await MainThread.Run(() => HairShape.ScaleBrush(Q("transferable"), Q("group"), F("factor"))),
                        "/clone_brush_hair" => await MainThread.Run(() => HairShape.CloneBrush(Q("transferable"), Q("group"),
                            F("dx", 0), F("dy", 0), F("dz", 0))),
                        "/clothing_colors" => await MainThread.Run(() => AdvancedEdit.ClothingColors(Q("group"))),
                        "/begin_clothing_edit" => await MainThread.Run(() => AdvancedEdit.BeginClothingEdit(Q("group"))),
                        "/measure" => await MainThread.Run(BodySize.Measure),
                        "/camera" => await MainThread.Run(() => CameraView.Run(Q("action"), F, Q("mode"))),
                        "/face_blendshapes" => await MainThread.Run(() => FacePreview.List(Q("filter"))),
                        "/face_preview" => await MainThread.Run(() => FacePreview.Set(Q("name"), F("weight", 100f))),
                        "/begin_hair_edit" => await MainThread.Run(() => Hair.BeginEdit(Q("material"))),
                        "/context_state" => await MainThread.Run(ContextState.Get),
                        "/create" => await FileLifecycle.Create(Q("gender")),
                        "/open" => await FileLifecycle.Open(Q("path")),
                        "/save" => await FileLifecycle.Save(Q("path")),
                        "/main_menu" => await FileLifecycle.MainMenu(string.Equals(Q("discard"), "true", StringComparison.OrdinalIgnoreCase)),
                        "/vrm_probe" => await MainThread.Run(VrmExportProbe.Info),
                        "/vrm_export_options" => await VrmExport.Options_(),
                        "/vrm_export_leave" => await VrmExport.Leave(),
                        "/vrm_export" => await VrmExport.Export(new VrmExport.Options
                        {
                            Path = Q("path"),
                            Version = Q("version") ?? "1",
                            MeshErasure = B("delete_transparent") ?? true,
                            HairCrossSection = B("hair_cross_section"),
                            HairSmoothness = I("hair_smoothness"), Hair = I("hair"), Face = I("face"), Body = I("body"), Outfit = I("outfit"),
                            MaterialMode = I("material_mode"), AtlasResolution = I("atlas_resolution"),
                            CombineHair = B("combine_hair"), TextureMode = I("texture_mode"), HairBones = I("hair_bones"),
                            Title = Q("title"), Author = Q("author"), ModelVersion = Q("model_version"),
                            Leave = B("leave") ?? true,
                            TimeoutSec = I("timeout") ?? 600,
                        }),
                        "/exit" => await FileLifecycle.Quit(string.Equals(Q("discard"), "true", StringComparison.OrdinalIgnoreCase)),
                        "/load_group" => await ContextState.Guarded(() => Presets.LoadGroup(Q("id"))),
                        "/apply_custom" => await ContextState.Guarded(() => CustomItems.Apply(Q("file"))),
                        "/remove_group" => await ContextState.Guarded(() => Presets.Remove(Q("group"))),
                        "/custom_items" => await MainThread.Run(Catalog.CustomItems),
                        "/preset_thumbnail" => await MainThread.Run(() => Catalog.PresetThumbnail(Q("resource"), Q("path"))),
                        "/presets" => await MainThread.Run(() => Presets.List(Q("filter"),
                            string.Equals(Q("include_locked"), "true", StringComparison.OrdinalIgnoreCase), (int)F("limit", 200))),
                        "/apply_preset" => await ContextState.Guarded(() => Presets.Apply(Q("id"),
                            string.Equals(Q("preserve_material"), "true", StringComparison.OrdinalIgnoreCase))),
                        "/undo" => await VRoidApi.Undo(),
                        "/redo" => await VRoidApi.Redo(),
                        "/screenshot" => await VRoidApi.Screenshot(Q("path"),
                            (int)F("width", 0), (int)F("height", 0),
                            (int)F("msaa", 4), (int)F("ssaa", 2),
                            !string.Equals(Q("clean"), "false", StringComparison.OrdinalIgnoreCase)),
                        _ => throw new FileNotFoundException("unknown route"),
                    };
                }
                catch (Exception e)
                {
                    code = e is FileNotFoundException ? 404 : 500;
                    result = new { error = e.GetType().Name, message = e.Message };
                    Plugin.Logger.LogWarning($"{request.Path}: {e}");
                }

                var bytes = JsonSerializer.SerializeToUtf8Bytes(result, Json);
                await WriteResponse(stream, code, bytes);
            }
            catch (Exception e)
            {
                // Requête tronquée, client parti, etc. : ne pas tuer la boucle d'acceptation.
                Plugin.Logger.LogDebug($"HTTP client: {e.GetType().Name}: {e.Message}");
            }
        }
    }

    static async Task WriteResponse(NetworkStream stream, int code, byte[] body)
    {
        string reason = code switch
        {
            200 => "OK",
            404 => "Not Found",
            _ => "Internal Server Error",
        };
        var head = Encoding.ASCII.GetBytes(
            $"HTTP/1.1 {code} {reason}\r\n" +
            "Content-Type: application/json; charset=utf-8\r\n" +
            $"Content-Length: {body.Length}\r\n" +
            "Connection: close\r\n\r\n");
        await stream.WriteAsync(head, 0, head.Length);
        if (body.Length > 0) await stream.WriteAsync(body, 0, body.Length);
        await stream.FlushAsync();
    }

    sealed class Request
    {
        public string Path = "/";
        public string Body = "";
        public Dictionary<string, string> Query = new(StringComparer.Ordinal);
    }

    static async Task<Request> ReadRequest(NetworkStream stream)
    {
        var buffer = new byte[8192];
        using var received = new MemoryStream();
        int headerEnd = -1;
        while (headerEnd < 0)
        {
            int n = await stream.ReadAsync(buffer, 0, buffer.Length);
            if (n <= 0) throw new EndOfStreamException("empty request");
            received.Write(buffer, 0, n);
            if (received.Length > 64 * 1024) throw new InvalidDataException("headers too large");
            headerEnd = FindHeaderEnd(received.GetBuffer(), (int)received.Length);
        }

        var all = received.ToArray();
        string headerText = Encoding.ASCII.GetString(all, 0, headerEnd);
        var lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.None);
        if (lines.Length == 0) throw new InvalidDataException("missing request line");
        var parts = lines[0].Split(' ');
        if (parts.Length < 2) throw new InvalidDataException("bad request line");

        string target = parts[1];
        string path = target;
        string queryText = "";
        int q = target.IndexOf('?');
        if (q >= 0)
        {
            path = target.Substring(0, q);
            queryText = target.Substring(q + 1);
        }

        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 1; i < lines.Length; i++)
        {
            int colon = lines[i].IndexOf(':');
            if (colon <= 0) continue;
            headers[lines[i].Substring(0, colon).Trim()] = lines[i].Substring(colon + 1).Trim();
        }

        int contentLength = 0;
        if (headers.TryGetValue("Content-Length", out var lengthText))
            int.TryParse(lengthText, out contentLength);
        if (contentLength < 0 || contentLength > 32 * 1024 * 1024)
            throw new InvalidDataException("bad content length");

        if (contentLength > 0 && headers.TryGetValue("Expect", out var expect) &&
            expect.IndexOf("100-continue", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            var cont = Encoding.ASCII.GetBytes("HTTP/1.1 100 Continue\r\n\r\n");
            await stream.WriteAsync(cont, 0, cont.Length);
            await stream.FlushAsync();
        }

        var bodyBytes = new byte[contentLength];
        int bodyStart = headerEnd + 4;
        int already = Math.Max(0, all.Length - bodyStart);
        int copied = Math.Min(already, contentLength);
        if (copied > 0) Array.Copy(all, bodyStart, bodyBytes, 0, copied);
        int read = copied;
        while (read < contentLength)
        {
            int n = await stream.ReadAsync(bodyBytes, read, contentLength - read);
            if (n <= 0) break;
            read += n;
        }

        return new Request
        {
            Path = Decode(path),
            Body = read > 0 ? Encoding.UTF8.GetString(bodyBytes, 0, read) : "",
            Query = ParseQuery(queryText),
        };
    }

    static int FindHeaderEnd(byte[] bytes, int length)
    {
        for (int i = 0; i + 3 < length; i++)
        {
            if (bytes[i] == '\r' && bytes[i + 1] == '\n' && bytes[i + 2] == '\r' && bytes[i + 3] == '\n')
                return i;
        }
        return -1;
    }

    static Dictionary<string, string> ParseQuery(string text)
    {
        var query = new Dictionary<string, string>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(text)) return query;
        foreach (var pair in text.Split('&'))
        {
            if (pair.Length == 0) continue;
            int eq = pair.IndexOf('=');
            string key = eq >= 0 ? pair.Substring(0, eq) : pair;
            string value = eq >= 0 ? pair.Substring(eq + 1) : "";
            query[Decode(key)] = Decode(value);
        }
        return query;
    }

    static string Decode(string value)
    {
        try { return Uri.UnescapeDataString(value.Replace("+", " ")); }
        catch { return value; }
    }
}

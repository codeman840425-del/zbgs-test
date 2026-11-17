using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using VRoidCore.Common.SpecificTypes;
using VRoidCore.Editing;
using VRoidCore.Editing.History.Command;
using VRoidCore.Editing.Query;

namespace VRoidMcpBridge;

/// <summary>
/// Forme des cheveux : groupes procéduraux (longueur, nombre de mèches) et groupes dessinés au pinceau
/// (allonger les mèches en déplaçant leurs points de contrôle, dupliquer un groupe pour ajouter des mèches).
/// </summary>
public static class HairShape
{
    static Context Ctx() => VRoidApi.RequireContextPublic();

    static void Exec(Context c, Il2CppInterop.Runtime.InteropTypes.Il2CppObjectBase cmd) =>
        c.ExecuteSyncCommand(cmd.Cast<ISyncCommand<Context.HistoryManagerContext, Model>>());

    static IEnumerable<string> HairTransferables(Context c)
    {
        foreach (var kv in c.GetActiveLeafTransferables())
            if ((kv.Value?.Type ?? "").Contains("Hair")) yield return kv.Key;
    }

    static List<IHairStrandPath> Strands(Model model, IHairGroupPath g)
    {
        var list = new List<IHairStrandPath>();
        foreach (var s in new GetHairGroupChildrenQuery(g).Execute(model)) if (s != null) list.Add(s);
        return list;
    }

    /// <summary>Liste les groupes de cheveux (type, nom, paramètres utiles, nombre de mèches).</summary>
    public static object Groups()
    {
        var c = Ctx();
        var model = c.ActiveModel;
        var result = new List<object>();
        foreach (var tid in HairTransferables(c))
        {
            foreach (var g in new GetHairGroupListQuery(tid).Execute(model))
            {
                if (g == null) continue;
                string name = null;
                try { name = new GetHairGroupNameQuery(g).Execute(model)?.ToString(); } catch { }
                var strands = Strands(model, g);
                if (g.TryCast<ProceduralHairGroupPath>() is { } pg)
                {
                    var ps = new GetProceduralHairGroupParameterSetQuery(pg).Execute(model);
                    var f = ps?.ProceduralFormParameterSet;
                    result.Add(new { kind = "procedural", transferable = tid, group = pg.HairGroupId, name,
                        length = f?.Length, hairCount = f?.HairCount, strands = strands.Count });
                }
                else if (g.TryCast<BrushHairGroupPath>() is { } bg)
                {
                    float total = 0;
                    var strandIds = new List<string>();
                    foreach (var s in strands)
                    {
                        total += StrandLength(model, s);
                        var bs = s.TryCast<BrushHairStrandPath>();
                        if (bs != null) strandIds.Add(bs.HairStrandId);
                    }
                    result.Add(new { kind = "brush", transferable = tid, group = bg.HairGroupId, name,
                        strands = strands.Count, meanStrandLength = strands.Count > 0 ? total / strands.Count : 0,
                        strandIds });
                }
                else result.Add(new { kind = "?", transferable = tid, name, strands = strands.Count });
            }
        }
        return result;
    }

    static float StrandLength(Model model, IHairStrandPath s)
    {
        int n = new GetHairStrandControlPointCountQuery(s).Execute(model);
        float len = 0;
        Vector3 prev = default;
        for (int i = 0; i < n; i++)
        {
            var p = new GetHairStrandControlPointQuery(s, i).Execute(model).Point;
            if (i > 0) len += Vector3.Distance(prev, p);
            prev = p;
        }
        return len;
    }

    /// <summary>Groupe procédural : longueur et/ou nombre de mèches. Annulable.</summary>
    public static object SetProcedural(string transferable, string group, float length, int hairCount)
    {
        var c = Ctx();
        var path = new ProceduralHairGroupPath(transferable, group);
        Action<ProceduralHairGroupParameterSet> mod = ps =>
        {
            if (!float.IsNaN(length)) ps.ProceduralFormParameterSet.Length = length;
            if (hairCount > 0) ps.ProceduralFormParameterSet.HairCount = hairCount;
        };
        Exec(c, new ModifyProceduralHairGroupParameterSetCommand("mcp", path,
            (Il2CppSystem.Action<ProceduralHairGroupParameterSet>)mod, true));
        var f = new GetProceduralHairGroupParameterSetQuery(path).Execute(c.ActiveModel).ProceduralFormParameterSet;
        return new { ok = true, length = f.Length, hairCount = f.HairCount };
    }

    /// <summary>
    /// Groupe dessiné au pinceau : allonge (factor &gt; 1) ou raccourcit chaque mèche en éloignant ses points
    /// de sa racine. Une étape d'annulation par point déplacé.
    /// </summary>
    public static object ScaleBrush(string transferable, string group, float factor)
    {
        var c = Ctx();
        var model = c.ActiveModel;
        var gp = new BrushHairGroupPath(transferable, group);
        int moved = 0, strandsDone = 0;
        foreach (var s in Strands(model, gp.Cast<IHairGroupPath>()))
        {
            var bs = s.TryCast<BrushHairStrandPath>();
            if (bs == null) continue;
            int n = new GetHairStrandControlPointCountQuery(s).Execute(model);
            if (n < 2) continue;
            var pts = new ControlPoint[n];
            for (int i = 0; i < n; i++) pts[i] = new GetHairStrandControlPointQuery(s, i).Execute(model);
            var root = pts[0].Point;
            for (int i = 1; i < n; i++)
            {
                var cp = pts[i];
                cp.Point = root + (cp.Point - root) * factor;
                Exec(c, new MoveBrushHairStrandControlPointCommand(bs, i, cp));
                moved++;
            }
            strandsDone++;
        }
        return new { ok = true, strands = strandsDone, pointsMoved = moved, factor };
    }

    /// <summary>Duplique un groupe pinceau puis décale la copie (dx, dy, dz) pour créer des mèches supplémentaires.</summary>
    public static object CloneBrush(string transferable, string group, float dx, float dy, float dz)
    {
        var c = Ctx();
        var model = c.ActiveModel;
        var before = new HashSet<string>(new GetHairGroupListQuery(transferable).Execute(model)
            .Where(g => g != null).Select(g => g.TryCast<BrushHairGroupPath>()?.HairGroupId).Where(x => x != null));
        Exec(c, new CloneBrushHairGroupCommand(new BrushHairGroupPath(transferable, group)));
        model = c.ActiveModel;
        var created = new GetHairGroupListQuery(transferable).Execute(model)
            .Where(g => g != null).Select(g => g.TryCast<BrushHairGroupPath>())
            .FirstOrDefault(g => g != null && !before.Contains(g.HairGroupId));
        if (created == null) return new { ok = false, message = "copy not found after duplication" };
        int moved = 0;
        var off = new Vector3(dx, dy, dz);
        if (off != Vector3.zero)
            foreach (var s in Strands(model, created.Cast<IHairGroupPath>()))
            {
                var bs = s.TryCast<BrushHairStrandPath>();
                if (bs == null) continue;
                int n = new GetHairStrandControlPointCountQuery(s).Execute(model);
                for (int i = 0; i < n; i++)
                {
                    var cp = new GetHairStrandControlPointQuery(s, i).Execute(model);
                    cp.Point += off;
                    Exec(c, new MoveBrushHairStrandControlPointCommand(bs, i, cp));
                    moved++;
                }
            }
        return new { ok = true, newGroup = created.HairGroupId, pointsMoved = moved };
    }
    static BrushHairStrandPath FindStrand(Model model, string transferable, string group, string strand)
    {
        if (string.IsNullOrEmpty(transferable)) throw new ArgumentException("missing parameter: transferable");
        if (string.IsNullOrEmpty(group)) throw new ArgumentException("missing parameter: group");
        if (string.IsNullOrEmpty(strand)) throw new ArgumentException("missing parameter: strand");
        var gp = new BrushHairGroupPath(transferable, group);
        foreach (var s in Strands(model, gp.Cast<IHairGroupPath>()))
        {
            var bs = s.TryCast<BrushHairStrandPath>();
            if (bs != null && bs.HairStrandId == strand) return bs;
        }
        throw new ArgumentException("unknown brush hair strand: " + strand);
    }

    static IHairStrandPath AsPath(BrushHairStrandPath bs) => bs.Cast<IHairStrandPath>();

    static object Point(ControlPoint cp) => new
    {
        x = cp.Point.x, y = cp.Point.y, z = cp.Point.z,
        nx = cp.Normal.x, ny = cp.Normal.y, nz = cp.Normal.z,
        u = cp.Uv.x, v = cp.Uv.y,
    };

    /// <summary>Points de contrôle d'une mèche dessinée au pinceau (lecture seule).</summary>
    public static object Points(string transferable, string group, string strand)
    {
        var c = Ctx();
        var model = c.ActiveModel;
        var bs = FindStrand(model, transferable, group, strand);
        int count = new GetHairStrandControlPointCountQuery(AsPath(bs)).Execute(model);
        var points = new List<object>();
        for (int i = 0; i < count; i++)
        {
            var cp = new GetHairStrandControlPointQuery(AsPath(bs), i).Execute(model);
            points.Add(new { index = i, point = Point(cp) });
        }
        return new { ok = true, transferable, group, strand, count, points };
    }

    /// <summary>Déplace un point de contrôle d'une mèche pinceau. Les normale/UV omis gardent leur valeur.</summary>
    public static object MovePoint(string transferable, string group, string strand, int index,
        float x, float y, float z, float nx, float ny, float nz, float u, float v)
    {
        var c = Ctx();
        var model = c.ActiveModel;
        var bs = FindStrand(model, transferable, group, strand);
        int count = new GetHairStrandControlPointCountQuery(AsPath(bs)).Execute(model);
        if (index < 0 || index >= count)
            throw new ArgumentOutOfRangeException(nameof(index), $"point index must be 0..{count - 1}");
        var cp = new GetHairStrandControlPointQuery(AsPath(bs), index).Execute(model);
        cp.Point = new Vector3(x, y, z);
        if (!float.IsNaN(nx) || !float.IsNaN(ny) || !float.IsNaN(nz))
            cp.Normal = new Vector3(float.IsNaN(nx) ? 0 : nx, float.IsNaN(ny) ? 0 : ny, float.IsNaN(nz) ? 0 : nz);
        if (!float.IsNaN(u) || !float.IsNaN(v))
            cp.Uv = new Vector2(float.IsNaN(u) ? 0 : u, float.IsNaN(v) ? 0 : v);
        Exec(c, new MoveBrushHairStrandControlPointCommand(bs, index, cp));
        var after = new GetHairStrandControlPointQuery(AsPath(bs), index).Execute(c.ActiveModel);
        return new { ok = true, transferable, group, strand, index, count, point = Point(after) };
    }

    /// <summary>Duplique une mèche pinceau dans son groupe, avec un décalage optionnel. Annulable.</summary>
    public static object DuplicateStrand(string transferable, string group, string strand, float dx, float dy, float dz)
    {
        var c = Ctx();
        var model = c.ActiveModel;
        var bs = FindStrand(model, transferable, group, strand);
        var gp = new BrushHairGroupPath(transferable, group);
        var before = new HashSet<string>(Strands(model, gp.Cast<IHairGroupPath>())
            .Select(s => s.TryCast<BrushHairStrandPath>()?.HairStrandId)
            .Where(id => id != null));
        Exec(c, new CloneBrushHairStrandCommand(bs));
        model = c.ActiveModel;
        var created = Strands(model, gp.Cast<IHairGroupPath>())
            .Select(s => s.TryCast<BrushHairStrandPath>())
            .FirstOrDefault(s => s != null && !before.Contains(s.HairStrandId));
        if (created == null) return new { ok = false, message = "copy not found after duplication" };
        int moved = 0;
        var off = new Vector3(dx, dy, dz);
        if (off != Vector3.zero)
        {
            int n = new GetHairStrandControlPointCountQuery(AsPath(created)).Execute(model);
            for (int i = 0; i < n; i++)
            {
                var cp = new GetHairStrandControlPointQuery(AsPath(created), i).Execute(model);
                cp.Point += off;
                Exec(c, new MoveBrushHairStrandControlPointCommand(created, i, cp));
                moved++;
            }
        }
        return new { ok = true, transferable, group, source = strand,
            newStrand = created.HairStrandId, pointsMoved = moved };
    }

    static string MaterialOf(HairMaterialReference reference) => reference?.SharedHairMaterialId;

    /// <summary>Assigne un matériau de cheveux partagé à un groupe ou à une mèche pinceau. Annulable.</summary>
    public static object SetMaterial(string transferable, string group, string strand, string material)
    {
        if (string.IsNullOrEmpty(material)) throw new ArgumentException("missing parameter: material");
        var c = Ctx();
        var model = c.ActiveModel;
        var reference = HairMaterialReference.CreateSharedHairMaterial(material);
        string before, after, kind;
        if (!string.IsNullOrEmpty(strand))
        {
            var bs = FindStrand(model, transferable, group, strand);
            var path = new BrushHairStrandPath(bs.HairGroupletPath, bs.HairStrandId);
            before = MaterialOf(new GetBrushHairStrandParameterSetQuery(path).Execute(model)?.HairMaterialReference);
            Action<BrushHairParameterSet> mod = ps => ps.HairMaterialReference = reference;
            Exec(c, new ModifyBrushHairStrandParameterSetCommand("mcp", path,
                (Il2CppSystem.Action<BrushHairParameterSet>)mod));
            after = MaterialOf(new GetBrushHairStrandParameterSetQuery(path).Execute(c.ActiveModel)?.HairMaterialReference);
            kind = "strand";
        }
        else
        {
            var path = new BrushHairGroupPath(transferable, group);
            before = MaterialOf(new GetBrushHairGroupParameterSetQuery(path).Execute(model)?.HairMaterialReference);
            Action<BrushHairGroupParameterSet> mod = ps => ps.HairMaterialReference = reference;
            Exec(c, new ModifyBrushHairGroupParameterSetCommand("mcp", path,
                (Il2CppSystem.Action<BrushHairGroupParameterSet>)mod));
            after = MaterialOf(new GetBrushHairGroupParameterSetQuery(path).Execute(c.ActiveModel)?.HairMaterialReference);
            kind = "group";
        }
        return new { ok = after == material, kind, transferable, group, strand,
            before, material = after, requested = material };
    }

    static IEnumerable<HairBoneGroupPath> BonePaths(Context c, Model model, string transferable)
    {
        foreach (var tid in HairTransferables(c))
        {
            if (!string.IsNullOrEmpty(transferable) && tid != transferable) continue;
            var result = new GetHairBoneGroupMemberListQuery(tid).Execute(model);
            if (result?.hairBoneGroups == null) continue;
            foreach (var item in result.hairBoneGroups)
            {
                var path = item?.boneGroupPath;
                if (path != null) yield return path;
            }
        }
    }

    /// <summary>Groupes d'os de cheveux et leurs paramètres physiques.</summary>
    public static object Bones(string transferable)
    {
        var c = Ctx();
        var model = c.ActiveModel;
        var result = new List<object>();
        foreach (var path in BonePaths(c, model, transferable))
        {
            var data = new GetHairBoneGroupParameterSetQuery(path).Execute(model);
            if (data == null) continue;
            string name = null;
            try { name = new GetHairBoneGroupNameQuery(path).Execute(model)?.ToString(); } catch { }
            result.Add(new
            {
                transferable = path.TransferableId,
                group = path.BoneGroupId,
                name,
                boneCount = data.BoneCount,
                springRootRate = data.SpringRootRate,
                stiffness = data.VRMSpringBoneStiffness,
                gravity = data.VRMSpringBoneGravity,
                colliderRadius = data.VRMSpringBoneColliderRadius,
                hairCount = data.HairIds?.Count ?? 0,
            });
        }
        return result;
    }

    static HairBoneGroupPath FindBonePath(Context c, Model model, string transferable, string group)
    {
        if (string.IsNullOrEmpty(group)) throw new ArgumentException("missing parameter: group");
        foreach (var path in BonePaths(c, model, transferable))
            if (path.BoneGroupId == group) return path;
        throw new ArgumentException("unknown hair bone group: " + group);
    }

    /// <summary>Modifie les paramètres d'un groupe d'os de cheveux. Annulable.</summary>
    public static object SetBone(string transferable, string group, int boneCount,
        float springRootRate, float stiffness, float gravity, float colliderRadius)
    {
        var c = Ctx();
        var model = c.ActiveModel;
        var path = FindBonePath(c, model, transferable, group);
        Action<VRoidCore.Common.SpecificTypes.HairBoneGroup> mod = hg =>
        {
            if (boneCount >= 0) hg.BoneCount = boneCount;
            if (!float.IsNaN(springRootRate)) hg.SpringRootRate = springRootRate;
            if (!float.IsNaN(stiffness)) hg.VRMSpringBoneStiffness = stiffness;
            if (!float.IsNaN(gravity)) hg.VRMSpringBoneGravity = gravity;
            if (!float.IsNaN(colliderRadius)) hg.VRMSpringBoneColliderRadius = colliderRadius;
        };
        Exec(c, new ModifyHairBoneGroupParameterSetCommand("mcp", path,
            (Il2CppSystem.Action<VRoidCore.Common.SpecificTypes.HairBoneGroup>)mod, null));
        var data = new GetHairBoneGroupParameterSetQuery(path).Execute(c.ActiveModel);
        return new { ok = true, transferable = path.TransferableId, group = path.BoneGroupId,
            boneCount = data.BoneCount, springRootRate = data.SpringRootRate,
            stiffness = data.VRMSpringBoneStiffness, gravity = data.VRMSpringBoneGravity,
            colliderRadius = data.VRMSpringBoneColliderRadius };
    }

}

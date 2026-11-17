"""Offline tests. Execute only two AST-selected author functions; never start MCP/editor."""
import ast
import base64
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import call


REQUEST = {'method': 'tools/call', 'params': {'name': 'vroid_status', 'arguments': {}}}


def wire(result):
    return ('\n'.join(json.dumps(r) for r in [
        {'jsonrpc': '2.0', 'id': 1, 'result': {'protocolVersion': '2025-06-18', 'serverInfo': {'name': 'vroid-studio', 'version': '0.15.0'}}},
        {'jsonrpc': '2.0', 'id': 2, 'result': result},
    ]) + '\n').encode()


def content(payload, **kwargs):
    return {'content': [{'type': 'text', 'text': json.dumps(payload)}], 'isError': False, **kwargs}


class CallTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = (call.PACKAGE / 'mcp_server/vroid_mcp.py').read_bytes()
        assert hashlib.sha256(source).hexdigest() == '3db7783341056ac8d710783e9c71aa4c30760453935987e74ebbb6db68a259cf'
        tree = ast.parse(source)
        selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('handle', '_run_batch')]
        assert len(selected) == 2
        cls.author = {'json': json, 'maybe_scan': lambda: None}
        exec(compile(ast.Module(body=selected, type_ignores=[]), '<fixed-author-functions>', 'exec'), cls.author)

    def test_author_ok_false_is_not_iserror(self):
        self.author['run_tool'] = lambda name, args: {'ok': False, 'message': 'copy not found after duplication'}
        response = self.author['handle'](REQUEST)
        self.assertFalse(response['isError'])
        self.assertTrue(call.inspect_responses(wire(response), REQUEST)[1])

    def test_author_batch_hides_nested_failure(self):
        self.author['run_tool'] = lambda name, args: {'ok': True, 'result': {'ok': False}}
        batch = self.author['_run_batch']({'operations': [{'tool': 'vroid_set_param'}]})
        self.assertTrue(batch['__batch__']['ok'])
        self.author['run_tool'] = lambda name, args: batch
        response = self.author['handle'](REQUEST)
        self.assertFalse(response['isError'])
        self.assertTrue(call.inspect_responses(wire(response), REQUEST)[1])

    def test_nested_errors_and_partial_results(self):
        for payload in [{'result': {'error': 'bad'}}, {'result': {'http_status': 500}},
                        {'failed': ['item']}, {'notRestored': ['hair']},
                        {'requested': 3, 'executed': 2, 'results': []}]:
            with self.subTest(payload=payload):
                self.assertTrue(call.inspect_responses(wire(content(payload)), REQUEST)[1])

    def test_success_notice_warning_and_help(self):
        response = content({'ok': True, 'warnings': ['option refused; inspect separately']})
        response['content'].insert(0, {'type': 'text', 'text': 'Cache notice'})
        self.assertFalse(call.inspect_responses(wire(response), REQUEST)[1])
        help_request = {'method': 'tools/call', 'params': {'name': 'vroid_help'}}
        response = {'content': [{'type': 'text', 'text': 'Plain help text'}]}
        self.assertFalse(call.inspect_responses(wire(response), help_request)[1])
        self.assertTrue(call.inspect_responses(wire(response), REQUEST)[1])

    def test_empty_invalid_missing_duplicate_and_iserror(self):
        good = wire(content({'ok': True}))
        for raw in [b'', b'not json\n', b'\xff', good.splitlines()[0] + b'\n',
                    good + good.splitlines()[1] + b'\n', wire({'content': []}),
                    wire(content({'ok': True}, isError=True)),
                    wire({'content': [{'type': 'text', 'text': '{invalid'}]})]:
            with self.subTest(raw=raw[:40]):
                self.assertTrue(call.inspect_responses(raw, REQUEST)[1])

    def test_tools_list_non_tool_payload(self):
        self.assertFalse(call.inspect_responses(wire({'tools': []}), {'method': 'tools/list'})[1])

    def invoke_fake(self, result=None, error=None):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        request, output = root/'request.json', root/'result.json'
        request.write_text(json.dumps(REQUEST), encoding='utf-8')
        captured = io.StringIO()
        with patch.object(call.subprocess, 'run', return_value=result, side_effect=error) as runner, contextlib.redirect_stdout(captured):
            try:
                call.run_call(request, output)
            except SystemExit:
                pass
        runner.assert_called_once()
        return output, json.loads(output.read_text(encoding='utf-8')), captured.getvalue()

    def test_timeout_preserves_partial_bytes(self):
        raw, err = b'{partial', b'original stderr\xff'
        output, record, printed = self.invoke_fake(error=subprocess.TimeoutExpired('fake', 960, output=raw, stderr=err))
        self.assertFalse(record['ok'])
        self.assertIsNone(record['exitCode'])
        self.assertEqual(output.with_suffix('.json.stdout.bin').read_bytes(), raw)
        self.assertEqual(output.with_suffix('.json.stderr.bin').read_bytes(), err)
        self.assertNotIn('partial', printed)

    def test_parse_and_process_failure_are_recorded(self):
        raw = b'bad JSON\n'
        output, record, _ = self.invoke_fake(subprocess.CompletedProcess([], 7, raw, b'failed'))
        self.assertFalse(record['ok'])
        self.assertEqual(record['exitCode'], 7)
        self.assertEqual(output.with_suffix('.json.stdout.bin').read_bytes(), raw)

    def test_launch_failure_is_recorded(self):
        _, record, _ = self.invoke_fake(error=FileNotFoundError('missing interpreter'))
        self.assertFalse(record['ok'])
        self.assertIn('launch failed', record['failures'][0])

    def test_image_saved_without_base64_in_record_or_console(self):
        data = b'fake-image-payload-for-client-test'
        encoded = base64.b64encode(data).decode()
        raw = wire({'content': [{'type': 'image', 'mimeType': 'image/png', 'data': encoded}], 'isError': False})
        output, record, printed = self.invoke_fake(subprocess.CompletedProcess([], 0, raw, b''))
        self.assertTrue(record['ok'])
        self.assertEqual(Path(record['images'][0]).read_bytes(), data)
        self.assertNotIn(encoded, printed + output.read_text(encoding='utf-8'))
        self.assertIn(encoded.encode(), output.with_suffix('.json.stdout.bin').read_bytes())

    def test_bad_image_retains_failure_receipt(self):
        raw = wire({'content': [{'type': 'image', 'mimeType': 'image/png', 'data': '*invalid*'}]})
        _, record, _ = self.invoke_fake(subprocess.CompletedProcess([], 0, raw, b''))
        self.assertFalse(record['ok'])
        self.assertTrue(any('image 2/0' in s for s in record['failures']))

    def test_existing_evidence_refused_before_process(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)/'result.json'
            output.write_text('preserve')
            with patch.object(call.subprocess, 'run') as runner, self.assertRaises(FileExistsError):
                call.run_call(Path(temp)/'missing-request.json', output)
            runner.assert_not_called()
            self.assertEqual(output.read_text(), 'preserve')


if __name__ == '__main__':
    unittest.main(verbosity=2)

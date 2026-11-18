from pathlib import Path
from unittest import TestCase, mock

from variant_batch import publish_plan


class PlanPublicationTest(TestCase):
    def test_windows_lock_retries_rename_only(self):
        error = PermissionError('Locked'); error.winerror = 32
        package, output = mock.Mock(spec=Path), mock.Mock(spec=Path)
        package.rename.side_effect = [error, None]
        output.exists.return_value = False
        with mock.patch('variant_batch.time.sleep') as wait:
            publish_plan(package, output)
        self.assertEqual(package.rename.call_count, 2)
        wait.assert_called_once()

    def test_another_writer_wins_during_wait(self):
        error = PermissionError('Locked'); error.winerror = 5
        package, output = mock.Mock(spec=Path), mock.Mock(spec=Path)
        package.rename.side_effect = error
        output.exists.side_effect = [False, True]
        with mock.patch('variant_batch.time.sleep'), self.assertRaisesRegex(ValueError, 'already exists'):
            publish_plan(package, output)
        package.rename.assert_called_once()

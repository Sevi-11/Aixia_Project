import os
from pathlib import Path
import subprocess
import sys
from unittest import TestCase


class SecretKeySettingsTests(TestCase):
    def test_missing_production_secret_prevents_startup(self):
        environment = os.environ.copy()
        environment.pop('DJANGO_SECRET_KEY', None)
        environment['DJANGO_DEBUG'] = 'False'

        result = subprocess.run(
            [sys.executable, 'backend/manage.py', 'check'],
            cwd=Path(__file__).resolve().parents[2],
            env=environment,
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('DJANGO_SECRET_KEY must be set when DJANGO_DEBUG=False.', result.stderr)

    def test_debug_without_secret_uses_a_generated_local_key(self):
        environment = os.environ.copy()
        environment.pop('DJANGO_SECRET_KEY', None)
        environment['DJANGO_DEBUG'] = 'True'
        command = [
            sys.executable,
            '-c',
            'import dotenv; dotenv.load_dotenv = lambda *args, **kwargs: False; '
            'import config.settings as settings; print(settings.SECRET_KEY)',
        ]

        first = subprocess.run(
            command,
            cwd=Path(__file__).resolve().parents[1],
            env=environment,
            capture_output=True,
            text=True,
        )
        second = subprocess.run(
            command,
            cwd=Path(__file__).resolve().parents[1],
            env=environment,
            capture_output=True,
            text=True,
        )

        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertTrue(first.stdout.strip())
        self.assertNotEqual(first.stdout, second.stdout)

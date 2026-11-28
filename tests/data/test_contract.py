import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class ContractTest(unittest.TestCase):
    def test_validate_data_passes_on_committed_data(self):
        r = subprocess.run([sys.executable, str(ROOT / "pipeline" / "validate_data.py")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_no_secrets_committed(self):
        bad = [p for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts and "node_modules" not in p.parts
               and ("service-account" in p.name or p.name == ".env" or p.name.startswith("ee-key"))]
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()

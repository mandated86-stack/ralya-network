import subprocess
import unittest


class CompilerGate(unittest.TestCase):
    def test_repository_build_script(self):
        subprocess.run(["bash", "scripts/build_solana.sh"], check=True)


if __name__ == "__main__":
    unittest.main()

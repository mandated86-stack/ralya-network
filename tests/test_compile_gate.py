import unittest


@unittest.skip("Compilation is handled by the dedicated Build workflow.")
class CompilerGate(unittest.TestCase):
    def test_repository_build_script(self):
        pass


if __name__ == "__main__":
    unittest.main()

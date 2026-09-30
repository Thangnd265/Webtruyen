import inspect
import vieneu

print("=== VIENEU MODULE ===")
print("File:", vieneu.__file__)

try:
    engine = vieneu.Vieneu()
    print("Vieneu class instantiated successfully.")
    print("Attributes:", [a for a in dir(engine) if not a.startswith("__")])
    print("Preset voices:", engine.list_preset_voices())
    if hasattr(engine, '_voice_aliases'):
        print("Voice aliases:", engine._voice_aliases)
    
    import os
    print("=== VOICES DIR ===")
    for vdir in ["/root/webtruyen/voices", "/root/webtruyen/models", "voices"]:
        if os.path.exists(vdir):
            print(f"{vdir}:", os.listdir(vdir))
except Exception as e:
    print("Error initializing Vieneu:", e)

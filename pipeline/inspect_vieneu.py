import inspect
import vieneu

print("=== VIENEU MODULE ===")
print("File:", vieneu.__file__)

try:
    engine = vieneu.Vieneu()
    print("Vieneu class instantiated successfully.")
    print("Attributes:", [a for a in dir(engine) if not a.startswith("__")])
    for attr in ["voices", "available_voices", "preset_voices", "speakers"]:
        if hasattr(engine, attr):
            print(f"{attr}:", getattr(engine, attr))
    # Inspect infer method signature
    sig = inspect.signature(engine.infer)
    print("engine.infer signature:", sig)
except Exception as e:
    print("Error initializing Vieneu:", e)

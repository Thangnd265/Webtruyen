import inspect
import vieneu

engine = vieneu.Vieneu()
print("--- add_voice source ---")
print(inspect.getsource(engine.add_voice))

print("--- _load_voices_from_file source ---")
print(inspect.getsource(engine._load_voices_from_file))

print("--- _resolve_ref_voice source ---")
print(inspect.getsource(engine._resolve_ref_voice))

import time
import vieneu

print("Loading Vieneu...")
engine = vieneu.Vieneu()
text = "Lục Thần hơi mở mắt ra, tầm mắt dần dần rõ ràng. Chung quanh là một mảnh rừng rậm."

t0 = time.time()
audio = engine.infer(text, voice="Thiện Minh")
elapsed = time.time() - t0
print(f"Generated test sentence in {elapsed:.3f} seconds.")

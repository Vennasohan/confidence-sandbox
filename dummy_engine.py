import sys
import json

def process_input(data_str):
    try:
        data = json.loads(data_str)
        if not isinstance(data, list) or len(data) == 0:
            return "0.0000"
            
        x = data[0]
        if not isinstance(x, (int, float)):
            return "0.0000"
            
        if x > 1e50 or x < -1e50:
            return "0.0000"
            
        return f"{x * 5:.4f}"
    except Exception:
        return "0.0000"

if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(process_input(sys.argv[1]))
    else:
        print(process_input(sys.stdin.read().strip()))

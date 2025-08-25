# predict_earnings.py - OPTIMIZED
import pandas as pd
import sys
import json

def main():
    try:
        input_data = sys.stdin.read()
        data = json.loads(input_data)
        
        if not data:
            print(json.dumps({"error": "No data"}))
            return 1

        # Simple prediction as fallback (remove Prophet for now)
        df = pd.DataFrame(data)
        amounts = df['amount'].tolist()
        
        # Simple average prediction (replace with Prophet later)
        predicted_amount = int(sum(amounts) / len(amounts))
        
        result = {
            "prediction": predicted_amount,
            "next_month": "2025-09-01",
            "note": "simple_average_used"
        }
        
        print(json.dumps(result))
        return 0
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return 1

if __name__ == "__main__":
    sys.exit(main())
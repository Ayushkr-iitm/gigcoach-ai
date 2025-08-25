# train_model.py
import pandas as pd
import sys
import json
from datetime import datetime, timedelta
from prophet import Prophet # <-- FIXED: Added the missing import for Prophet

# --- ADD YOUR DATABASE CONNECTION LOGIC HERE ---
# You'll need to install psycopg2: `pip install psycopg2-binary`
import psycopg2
from psycopg2.extras import RealDictCursor

# Database connection function
def get_db_connection():
    conn = psycopg2.connect(
        host="localhost",
        database="gigcoach_db",
        user="postgres",
        password="Ayush@1234" #
    )
    return conn

def main(user_id):
    # 1. Fetch the user's historical data from PostgreSQL
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    query = "SELECT date, amount FROM earnings WHERE user_id = %s ORDER BY date;" #
    cur.execute(query, (user_id,))
    earnings_data = cur.fetchall()
    cur.close()
    conn.close()

    if not earnings_data:
        print(f"No data found for user_id {user_id}")
        return

    # 2. Prepare data for Prophet
    df = pd.DataFrame(earnings_data) #
    df['ds'] = pd.to_datetime(df['date'])
    df['y'] = df['amount']

    # 3. Create and train the model
    model = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False) #
    model.fit(df[['ds', 'y']])

    # 4. Make a forecast for the next month
    future = model.make_future_dataframe(periods=30)
    forecast = model.predict(future)
    next_month_prediction = forecast[['ds', 'yhat']].iloc[-1]
    predicted_amount = int(next_month_prediction['yhat'])

    # 5. Save this prediction to the forecasts table
    conn = get_db_connection()
    cur = conn.cursor()
    insert_query = "INSERT INTO forecasts (user_id, forecast_date, predicted_amount) VALUES (%s, %s, %s);" #
    cur.execute(insert_query, (user_id, next_month_prediction['ds'], predicted_amount))
    conn.commit()
    cur.close()
    conn.close()

    print(f"Successfully generated forecast for user {user_id}: ₹{predicted_amount}") #

if __name__ == "__main__":
    # This script can be run for a specific user: `python train_model.py 1`
    if len(sys.argv) != 2:
        print("Usage: python train_model.py <user_id>")
        sys.exit(1)
    user_id = int(sys.argv[1])
    main(user_id)
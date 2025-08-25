# test_db.py
import psycopg2
from psycopg2.extras import RealDictCursor

def test_connection():
    try:
        conn = psycopg2.connect(
            host="localhost",
            database="gigcoach_db",
            user="postgres",
            password="your_postgres_password_here"  # <<< USE YOUR REAL PASSWORD
        )
        print("✅ Database connection successful!")
        
        # Test a simple query
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users;")
        result = cur.fetchone()
        print(f"📊 Found {result[0]} users in the database")
        
        cur.close()
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

if __name__ == "__main__":
    test_connection()
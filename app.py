import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime
import os
import json
import gspread
from google.oauth2.service_account import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from base64 import urlsafe_b64decode
import re
from streamlit import markdown

# ----------------------------
# Google Sheets API Setup
# ----------------------------
SHEET_ID = "1curtwbwVbe8PslkOLh56SskCfu4idfxdmqO2mMVqVN0"
SHEET_NAME = "FINLIGHT-USER-DATA"
CREDENTIALS_FILE = "credentials.json"

if os.path.exists(CREDENTIALS_FILE):
    scope = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=scope)
    client = gspread.authorize(creds)
    try:
        sheet = client.open_by_key(SHEET_ID).worksheet(SHEET_NAME)
    except Exception as e:
        st.error(f"Failed to connect to Google Sheet: {e}")
        sheet = None
else:
    sheet = None
import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, timedelta
import os
import json
import gspread
from google.oauth2.service_account import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import calendar
import re
from base64 import urlsafe_b64decode

# ----------------------------
# Landing Page: FinLight Welcome Screen
# ----------------------------
if "start_app" not in st.session_state:
    st.session_state["start_app"] = False

if not st.session_state["start_app"]:
    st.title(" MoneyMate- Track. Save. Thrive")
    st.markdown("""
    - Track your daily expenses  
    - Set and hit your saving goals  
    -  Manage recurring costs  
    -  See your monthly Financial Health Score  
    - Secure & personalized tracking

    Ready to take control of your money?
    """)
    if st.button(" Start "):
        st.session_state["start_app"] = True
    st.stop()

# ----------------------------
# User Authentication System
# ----------------------------
USER_CRED_FILE = "user_credentials.json"

def load_users():
    if os.path.exists(USER_CRED_FILE):
        with open(USER_CRED_FILE, "r") as f:
            return json.load(f)
    return {}

def save_users(users):
    with open(USER_CRED_FILE, "w") as f:
        json.dump(users, f)

users = load_users()

st.sidebar.title("MoneyMate — Track. Save. Thrive.")


st.sidebar.subheader("Login or Sign Up")
mode = st.sidebar.radio("Select", ["Login", "Sign Up"])
user_id = st.sidebar.text_input("Username")
password = st.sidebar.text_input("Password", type="password")

if not user_id or not password:
    st.warning("Please enter username and password to continue.")
    st.stop()

if mode == "Sign Up":
    if user_id in users:
        st.sidebar.error("Username already exists. Try logging in.")
        st.stop()
    else:
        users[user_id] = password
        save_users(users)
        st.sidebar.success("Sign-up successful. Please log in.")
        st.stop()
else:  # Login
    if users.get(user_id) != password:
        st.sidebar.error("Invalid credentials. Try again.")
        st.stop()

# ----------------------------
# Data File
# ----------------------------
DATA_FILE = f"finlight_data_{user_id}.json"

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r") as f:
            data = json.load(f)
            st.session_state["monthly_allowance"] = data.get("monthly_allowance", 5000)
            st.session_state["expenses"] = pd.DataFrame(data.get("expenses", {}))
            st.session_state["saving_goals"] = data.get("saving_goals", [])
            st.session_state["recurring_expenses"] = data.get("recurring_expenses", [])
            st.session_state["owings"] = data.get("owings", [])

def save_data():
    expenses = st.session_state["expenses"].copy()
    expenses["Date"] = expenses["Date"].astype(str)
    data = {
        "monthly_allowance": st.session_state["monthly_allowance"],
        "expenses": expenses.to_dict(),
        "saving_goals": st.session_state.get("saving_goals", []),
        "recurring_expenses": st.session_state.get("recurring_expenses", []),
        "owings": st.session_state.get("owings", [])
    }
    with open(DATA_FILE, "w") as f:
        json.dump(data, f)

if "initialized" not in st.session_state:
    st.session_state["monthly_allowance"] = 5000
    st.session_state["expenses"] = pd.DataFrame(columns=["Date", "Category", "Amount", "Note"])
    st.session_state["saving_goals"] = []
    st.session_state["recurring_expenses"] = []
    st.session_state["owings"] = []
    load_data()
    st.session_state["initialized"] = True

# ----------------------------
# App Title
# ----------------------------
st.title(" MoneyMate - Track. Save. Thrive")


# ----------------------------
# Monthly Allowance
# ----------------------------
st.subheader("Monthly Allowance")
current_allowance = st.session_state["monthly_allowance"]
updated_allowance = st.number_input("Enter Your Monthly Allowance (₹)", min_value=0, step=100, value=current_allowance)
st.session_state["monthly_allowance"] = updated_allowance
save_data()

st.markdown("---")

# ----------------------------
# Add Expense
# ----------------------------
st.subheader("Add New Expense")
with st.form("expense_form"):
    date = st.date_input("Date", value=datetime.today())
    category = st.selectbox("Category", ["Food", "Books", "Rent", "Transport", "Entertainment", "Other"])
    amount = st.number_input("Amount (₹)", min_value=0.0, step=10.0)
    note = st.text_input("Note (optional)")
    submitted = st.form_submit_button("Add Expense")

    if submitted:
        new_expense = pd.DataFrame([{
            'Date': date,
            'Category': category,
            'Amount': amount,
            'Note': note
        }])
        st.session_state["expenses"] = pd.concat([st.session_state["expenses"], new_expense], ignore_index=True)
        st.success("Expense added!")
        save_data()

        if sheet:
            try:
                sheet.append_row([user_id, str(date), category, amount, note])
            except Exception as e:
                st.warning(f"Google Sheet error: {e}")

# ----------------------------
# Saving Goals
st.subheader(" Set a Saving Goal")

with st.form("goal_form"):
    goal_name = st.text_input("Goal Name")
    goal_amount = st.number_input("Amount to Save (₹)", min_value=0.0, step=100.0)
    goal_deadline = st.date_input("Target Date")
    goal_submit = st.form_submit_button("Add Goal")

    if goal_submit and goal_name:
        st.session_state["saving_goals"].append({
            "Goal": goal_name,
            "Amount": goal_amount,
            "Deadline": str(goal_deadline),
            "Done": False  # Initial status
        })
        save_data()
        st.success("Goal added!")

st.markdown("---")
st.subheader(" Your Goals")

if st.session_state["saving_goals"]:
    for i, goal in enumerate(st.session_state["saving_goals"]):
        col1, col2, col3, col4 = st.columns([3, 2, 2, 1])
        with col1:
            st.markdown(f"**{goal['Goal']}**")
        with col2:
            st.markdown(f"₹{goal['Amount']}")
        with col3:
            st.markdown(goal['Deadline'])
        with col4:
            done = st.checkbox("✅", value=goal.get("Done", False), key=f"done_{i}")
            st.session_state["saving_goals"][i]["Done"] = done
    save_data()  # Save after checkbox state changes
else:
    st.info("No saving goals set yet.")



st.markdown("---")
# ----------------------------
# Spending Summary
# ----------------------------
import calendar

st.subheader("Spending Summary")
expenses_df = st.session_state["expenses"].copy()
expenses_df["Date"] = pd.to_datetime(expenses_df["Date"]).dt.date

if not expenses_df.empty:
    today = datetime.today().date()
    start_of_month = today.replace(day=1)
    selected_year = today.year
    selected_month = today.month
    days_in_month = calendar.monthrange(selected_year, selected_month)[1]
    days_passed = (today - start_of_month).days + 1
    
    monthly_expenses = expenses_df[expenses_df["Date"] >= start_of_month]
    total_spent = monthly_expenses["Amount"].sum()
    avg_daily = total_spent / days_passed if days_passed > 0 else 0
    est_days = int(st.session_state["monthly_allowance"] / avg_daily) if avg_daily > 0 else 999
    remaining = st.session_state["monthly_allowance"] - total_spent

    col1, col2, col3 = st.columns(3)
    col1.metric("📅 Avg Daily Spend", f"₹{avg_daily:.2f}")
    col2.metric("📆 Est. Days Left", f"{est_days} days")
    col3.metric("💰 Total Spent", f"₹{total_spent:.2f}")

    st.success(f"Remaining Budget: ₹{remaining:.2f}")

    # ----------------------------
    # Enhanced Financial Health Score
    # ----------------------------
    saving_percent = (remaining / st.session_state["monthly_allowance"]) * 100 if st.session_state["monthly_allowance"] else 0

    # Factors: Budget Management, Goal Progress, Spending Habits, Recurring Load
    goal_progress = 0
    if st.session_state["saving_goals"]:
        total_goal_amt = sum([goal['Amount'] for goal in st.session_state["saving_goals"]])
        goal_progress = min((remaining / total_goal_amt) * 100, 100) if total_goal_amt > 0 else 0

    recurring_amt = sum([r["Amount"] for r in st.session_state["recurring_expenses"]]) if st.session_state["recurring_expenses"] else 0
    recurring_load = min((recurring_amt / st.session_state["monthly_allowance"]) * 100, 100) if st.session_state["monthly_allowance"] else 0
    spending_variability = expenses_df.groupby("Date")["Amount"].sum().std()
    spending_stability_score = max(0, 100 - spending_variability) if not pd.isna(spending_variability) else 100

    # Weighted Score
    score = int(
        (saving_percent * 0.4) +
        (goal_progress * 0.2) +
        ((100 - recurring_load) * 0.2) +
        (spending_stability_score * 0.2)
    )
    st.markdown(f"### 🧠 Financial Health Score: `{score}/100`")

    # ----------------------------
    # Nudges & Rewards
    # ----------------------------
    if saving_percent < 20:
        st.info("⚠️ Nudge: You're spending quickly! Try skipping 1 delivery meal this week.")
    elif saving_percent >= 80:
        st.success("🎯 You're 80% to your goal! Maybe skip 1 coffee and you're there.")

    if saving_percent >= 90 and goal_progress >= 75:
        st.markdown("**🏅 Badge Unlocked: Budget Master!** Keep it going!")

else:
    st.info("Start adding expenses to view insights.")

st.markdown("---")

# ----------------------------
# Category Breakdown
# ----------------------------
if not st.session_state["expenses"].empty:
    st.subheader(" Spending by Category")
    pie_data = st.session_state["expenses"].groupby("Category")["Amount"].sum().reset_index()
    fig = px.pie(pie_data, names='Category', values='Amount', title='Category Distribution')
    st.plotly_chart(fig)
st.subheader("💸 All Expenses")

if "expenses" in st.session_state and not pd.DataFrame(st.session_state["expenses"]).empty:
    show_all = st.checkbox("Show full history", value=False)

    if show_all:
        st.dataframe(st.session_state["expenses"], use_container_width=True)
    else:
        st.markdown("Showing your **latest 3 expenses**:")
        latest_exp = pd.DataFrame(st.session_state["expenses"]).tail(3)
        st.dataframe(latest_exp, use_container_width=True)
else:
    st.info("No expenses recorded yet.")

# ----------------------------
# Recurring Expenses Section
# ----------------------------st.markdown("---")
st.subheader("🔁 Recurring Expenses")

with st.form("recurring_form"):
    rec_category = st.text_input("Recurring Category")
    rec_amount = st.number_input("Amount (₹)", min_value=0.0, step=10.0, key="rec_amt")
    rec_frequency = st.selectbox("Frequency", ["Daily", "Weekly", "Monthly", "Yearly"], key="rec_freq")
    rec_note = st.text_input("Note (optional)", key="rec_note")
    rec_submit = st.form_submit_button("Add Recurring Expense")

    if rec_submit and rec_category:
        st.session_state["recurring_expenses"].append({
            "Category": rec_category,
            "Amount": rec_amount,
            "Frequency": rec_frequency,
            "Note": rec_note
        })
        save_data()
        st.success("Recurring expense added!")

if st.session_state["recurring_expenses"]:
    rec_df = pd.DataFrame(st.session_state["recurring_expenses"])
    st.dataframe(rec_df, use_container_width=True)
else:
    st.info("No recurring expenses added yet.")

# ----------------------------
# Owing Tracker
# ----------------------------
st.markdown("---")
st.subheader(" Track Money Owed & Owing")
with st.form("owing_form"):
    owe_type = st.radio("Are you owed or do you owe someone?", ["I Owe", "Owed To Me"])
    owe_person = st.text_input("Person's Name")
    owe_amount = st.number_input("Amount (₹)", min_value=0.0, step=10.0, key="owe_amt")
    owe_note = st.text_input("Note (optional)", key="owe_note")
    owe_submit = st.form_submit_button("Add Entry")

    if owe_submit and owe_person:
        st.session_state["owings"].append({
            "Type": owe_type,
            "Person": owe_person,
            "Amount": owe_amount,
            "Note": owe_note
        })
        save_data()
        st.success("Owing record added!")

if st.session_state["owings"]:
    owe_df = pd.DataFrame(st.session_state["owings"])
    st.dataframe(owe_df, use_container_width=True)
else:
    st.info("No owing records yet.")
def get_gmail_service():
    creds = None
    if os.path.exists("user_credentials.json"):
        flow = InstalledAppFlow.from_client_secrets_file(
            "user_credentials.json", SCOPES)
        creds = flow.run_local_server(port=0)
    else:
        st.error("user_credentials.json file not found.")
        return None
    try:
        service = build("gmail", "v1", credentials=creds)
        return service
    except Exception as e:
        st.error(f"Error accessing Gmail: {e}")
        return None
import re  # Ensure this is imported at the top of your script

def get_recent_transactions(service, max_results=5):
    query = 'subject:(transaction OR debit OR purchase) newer_than:7d'
    results = service.users().messages().list(userId='me', q=query, maxResults=max_results).execute()
    messages = results.get('messages', [])
    transactions = []

    for msg in messages:
        txt = service.users().messages().get(userId='me', id=msg['id'], format='full').execute()
        
        # Check sender (From) header
        headers = txt['payload'].get('headers', [])
        sender = next((h['value'] for h in headers if h['name'] == 'From'), '')
        if not any(bank in sender.lower() for bank in ['axis', 'hdfc', 'icici', 'sbi', 'kotak']):
            continue  # Skip non-bank messages

        snippet = txt.get('snippet', '')
        amount_match = re.search(r'₹?\s?(\d{2,7})', snippet)
        if amount_match:
            amount = float(amount_match.group(1))
            transactions.append({
                "email_snippet": snippet,
                "amount": amount,
                "id": msg['id']  # for unique key
            })
    return transactions

import pandas as pd
from datetime import datetime, timedelta
import plotly.express as px
import calendar
from io import BytesIO

import base64

st.subheader("📅 Monthly Insights")

# Convert to DataFrame
exp_df = pd.DataFrame(st.session_state.get("expenses", []))

if not exp_df.empty and "Amount" in exp_df.columns and "Date" in exp_df.columns:
    # Convert Date column to datetime
    exp_df["Date"] = pd.to_datetime(exp_df["Date"], errors='coerce')

    # --- Month Selection Filter ---
    view = st.radio("Select Month", ["This Month", "Last Month", "Custom Month"])

    if view == "This Month":
        target_date = datetime.today()
    elif view == "Last Month":
        today = datetime.today()
        target_date = today.replace(day=1) - timedelta(days=1)
    else:
        target_date = st.date_input("Select Month", value=datetime.today())
        if isinstance(target_date, list):  # in case of date range
            target_date = target_date[0]

    selected_month = target_date.month
    selected_year = target_date.year

    month_exp = exp_df[
        (exp_df["Date"].dt.month == selected_month) &
        (exp_df["Date"].dt.year == selected_year)
    ]

    if month_exp.empty:
        st.info("No expenses found for selected month.")
    else:
        # --- Key Stats ---
        total_spent = month_exp["Amount"].sum()
        days_in_month = calendar.monthrange(selected_year, selected_month)[1]
        daily_avg = total_spent / days_in_month

        category_totals = month_exp.groupby("Category")["Amount"].sum()
        top_categories = category_totals.sort_values(ascending=False).head(3)
        top_cat = top_categories.idxmax()
        most_frequent_cat = month_exp["Category"].mode()[0]

        col1, col2, col3 = st.columns(3)
        col1.metric("💸 Total Spent", f"₹{total_spent:,.2f}")
        col2.metric("📆 Avg per Day", f"₹{daily_avg:,.2f}")
        col3.metric("🥇 Top Category", f"{top_cat} (₹{top_categories[top_cat]:,.2f})")

        st.markdown("### 🏆 Top 3 Spending Categories")
        for i, (cat, amt) in enumerate(top_categories.items(), start=1):
            st.write(f"**{i}. {cat}** — ₹{amt:,.2f}")

        st.markdown(f"### 🔁 Most Frequent Category: **{most_frequent_cat}**")

        # --- Charts ---
        st.markdown("### 📊 Visual Breakdown")
        breakdown = category_totals.reset_index().rename(columns={"Amount": "Total Spent"})
        bar = px.bar(breakdown, x="Category", y="Total Spent", color="Category", text_auto='.2s', title="Bar Chart")
        pie = px.pie(breakdown, names="Category", values="Total Spent", title="Spending Share")

        st.plotly_chart(bar, use_container_width=True)
        st.plotly_chart(pie, use_container_width=True)

        # --- Export Button ---
        def convert_df_to_csv(df):
            return df.to_csv(index=False).encode('utf-8')

        csv = convert_df_to_csv(month_exp)

        st.download_button(
            label="📥 Download Monthly Expense Data as CSV",
            data=csv,
            file_name=f"expenses_{selected_year}_{selected_month}.csv",
            mime="text/csv"
        )

else:
    st.info("No valid expense records found. Please add some data to get insights.")


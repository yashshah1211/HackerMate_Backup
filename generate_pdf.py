import json
import os
import html
import requests
import base64
from datetime import datetime, timezone, timedelta
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas

# Define paths relative to the script directory for OS/environment independence
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_FILE = os.path.join(SCRIPT_DIR, "HackerMate_Database_Report.pdf")
ENV_FILE = os.path.join(SCRIPT_DIR, ".env.local")

class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and display 'Page X of Y' page numbers
    as well as headers and footers on all pages except the cover page.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_elements(num_pages)
            super().showPage()
        super().save()

    def draw_page_elements(self, page_count):
        if self._pageNumber == 1:
            # Draw decorative cover page accent
            self.saveState()
            # Top accent bar in HackerMate Brand Lime-Green (#B4F461)
            self.setFillColor(colors.HexColor("#B4F461"))
            self.rect(0, 782, 612, 10, fill=True, stroke=False)
            # Left accent stripe
            self.setFillColor(colors.HexColor("#1e293b"))
            self.rect(0, 0, 15, 782, fill=True, stroke=False)
            self.restoreState()
            return
            
        self.saveState()
        # Draw header
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#0f172a")) # Slate-900
        self.drawString(36, 756, "HackerMate Database Export Report")
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b")) # Slate-500
        self.drawRightString(576, 756, "Confidential System Data")
        
        # Header line
        self.setStrokeColor(colors.HexColor("#cbd5e1")) # Slate-300
        self.setLineWidth(0.5)
        self.line(36, 750, 576, 750)
        
        # Draw footer line
        self.line(36, 45, 576, 45)
        
        # Draw footer text
        self.drawString(36, 32, f"Report Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(576, 32, page_text)
        self.restoreState()

def clean_xml_string(text):
    if text is None:
        return ""
    # Convert to string and strip control chars/escape XML entities
    text_str = str(text).replace('\r', '').replace('\n', ' ')
    return html.escape(text_str)

def truncate_str(text, max_len=150):
    if not text:
        return ""
    text_str = str(text)
    if len(text_str) > max_len:
        return text_str[:max_len] + "..."
    return text_str

def format_date(date_str):
    if not date_str:
        return "-"
    try:
        if ' ' in date_str:
            dt_part = date_str.split(' ')[0]
            tm_part = date_str.split(' ')[1].split('.')[0]
            return f"{dt_part} {tm_part}"
        elif 'T' in date_str:
            dt_part = date_str.split('T')[0]
            tm_part = date_str.split('T')[1].split('.')[0]
            return f"{dt_part} {tm_part}"
        return date_str
    except Exception:
        return date_str

def load_env():
    env = {
        "NEXT_PUBLIC_SUPABASE_URL": os.environ.get("NEXT_PUBLIC_SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
        "RESEND_API_KEY": os.environ.get("RESEND_API_KEY"),
        "RESEND_SANDBOX_RECIPIENT": os.environ.get("RESEND_SANDBOX_RECIPIENT")
    }
    
    # Fallback to loading from local .env.local if any are missing
    if not all(env.values()):
        if os.path.exists(ENV_FILE):
            with open(ENV_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        local_k = k.strip()
                        local_v = v.strip()
                        if local_k in env and not env[local_k]:
                            env[local_k] = local_v
                        if local_k == "ADMIN_CONTACT_EMAIL" and not env["RESEND_SANDBOX_RECIPIENT"]:
                            env["RESEND_SANDBOX_RECIPIENT"] = local_v
    return env

def get_last_run(supabase_url, service_key):
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}"
    }
    url = f"{supabase_url}/rest/v1/app_settings?key=eq.last_report_run&select=value"
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        results = response.json()
        if results and len(results) > 0:
            val = results[0].get("value")
            if val:
                print(f"Loaded last run timestamp from Supabase: {val}")
                return val
    except Exception as e:
        print(f"Error fetching last run from Supabase app_settings: {e}")
    
    # Default to 24 hours ago in UTC format
    default_time = datetime.now(timezone.utc) - timedelta(days=1)
    default_val = default_time.isoformat().replace('+00:00', 'Z')
    print(f"Using default last run timestamp: {default_val}")
    return default_val

def save_last_run(supabase_url, service_key, timestamp_str):
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    url = f"{supabase_url}/rest/v1/app_settings"
    payload = {
        "key": "last_report_run",
        "value": timestamp_str
    }
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        print(f"Successfully saved last run timestamp ({timestamp_str}) to Supabase app_settings.")
        return True
    except Exception as e:
        print(f"Error saving last run timestamp to Supabase app_settings: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        return False

def fetch_supabase_data(supabase_url, service_key):
    tables = [
        "profiles", "teams", "team_members", "notifications", "team_invites",
        "hackathons", "friend_requests", "conversations", "conversation_participants",
        "messages", "feedback", "team_documents", "app_settings", "team_hackathons"
    ]
    data = {}
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}"
    }
    print("Fetching data from Supabase REST API...")
    for table in tables:
        url = f"{supabase_url}/rest/v1/{table}?select=*"
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            data[table] = response.json()
            print(f"  Fetched {table}: {len(data[table])} total rows")
        except Exception as e:
            print(f"  Error fetching table {table}: {e}")
            data[table] = []
    return data

def parse_utc_timestamp(ts_str):
    if not ts_str:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        ts_str = ts_str.replace(' ', 'T')
        if ts_str.endswith('Z'):
            ts_str = ts_str[:-1] + '+00:00'
        # Trim milliseconds to 6 digits maximum if present
        if '.' in ts_str:
            parts = ts_str.split('.')
            tz_part = ""
            if '+' in parts[1]:
                sub_parts = parts[1].split('+')
                ms_part = sub_parts[0][:6]
                tz_part = '+' + sub_parts[1]
            elif '-' in parts[1]:
                sub_parts = parts[1].split('-')
                ms_part = sub_parts[0][:6]
                tz_part = '-' + sub_parts[1]
            else:
                ms_part = parts[1][:6]
            ts_str = parts[0] + '.' + ms_part + tz_part
        return datetime.fromisoformat(ts_str)
    except Exception as e:
        return datetime.min.replace(tzinfo=timezone.utc)

def filter_incremental_data(data, last_run_str):
    last_run_dt = parse_utc_timestamp(last_run_str)
    print(f"Filtering incremental activity since: {last_run_dt.isoformat()}")
    
    filtered_data = {}
    
    # Map of tables to their timestamp tracking columns
    time_columns = {
        "profiles": "created_at",
        "teams": "created_at",
        "team_members": "created_at",
        "notifications": "created_at",
        "team_invites": "created_at",
        "hackathons": "created_at",
        "friend_requests": "created_at",
        "conversations": "created_at",
        "conversation_participants": "joined_at",
        "messages": "created_at",
        "feedback": "created_at",
        "team_documents": "updated_at",
        "team_hackathons": "created_at"
    }

    for table, rows in data.items():
        if table == "app_settings":
            filtered_data[table] = []
            continue
            
        col = time_columns.get(table)
        if not col or not rows:
            filtered_data[table] = []
            continue
            
        filtered_rows = []
        for row in rows:
            val = row.get(col)
            if val:
                row_dt = parse_utc_timestamp(val)
                if row_dt > last_run_dt:
                    filtered_rows.append(row)
        filtered_data[table] = filtered_rows
        print(f"  Table {table}: {len(filtered_rows)} new rows")

    return filtered_data

def send_email_with_pdf(pdf_path, resend_key, recipient, summary, last_run_str, current_run_str):
    subject = f"HackerMate Daily Activity Report - {datetime.now().strftime('%Y-%m-%d')}"
    
    summary_html = "<h3>Daily Database Activity Summary</h3><ul>"
    total_new = 0
    for table, rows in summary.items():
        count = len(rows)
        total_new += count
        if count > 0:
            summary_html += f"<li><b>{table}:</b> {count} new record(s)</li>"
    summary_html += "</ul>"
    
    if total_new == 0:
        print("No new activity detected since last run. Sending notification email instead of PDF...")
        payload = {
            "from": "HackerMate Reports <onboarding@resend.dev>",
            "to": [recipient],
            "subject": f"HackerMate Daily Activity - No New Activity - {datetime.now().strftime('%Y-%m-%d')}",
            "html": f"""
            <html>
                <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
                    <h2 style="color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px;">HackerMate Daily Report</h2>
                    <p>Hello,</p>
                    <p>This is your daily database activity report for HackerMate.</p>
                    <p style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px;">
                        <b>No new activity or database records</b> were created or modified during this reporting window:<br/>
                        <span style="color: #475569; font-family: monospace;">From: {last_run_str}<br/>To:   {current_run_str}</span>
                    </p>
                    <p>As a result, no PDF attachment was generated.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 11px; color: #64748b;">This email was sent automatically by the scheduled HackerMate Reporting System on GitHub Actions.</p>
                </body>
            </html>
            """
        }
    else:
        print(f"New activity detected ({total_new} records). Compiling base64 attachment...")
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
        
        payload = {
            "from": "HackerMate Reports <onboarding@resend.dev>",
            "to": [recipient],
            "subject": subject,
            "html": f"""
            <html>
                <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
                    <h2 style="color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px;">HackerMate Daily Report</h2>
                    <p>Hello,</p>
                    <p>Please find attached the daily incremental activity report for HackerMate, showing changes during the following window:</p>
                    <p style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-family: monospace; color: #475569;">
                        From: {last_run_str}<br/>
                        To:   {current_run_str}
                    </p>
                    {summary_html}
                    <p>The detailed PDF contains structures, formatted records, and cross-reference resolutions for all new entries.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 11px; color: #64748b;">This email was sent automatically by the scheduled HackerMate Reporting System on GitHub Actions.</p>
                </body>
            </html>
            """,
            "attachments": [
                {
                    "filename": f"HackerMate_Activity_Report_{datetime.now().strftime('%Y%m%d')}.pdf",
                    "content": pdf_base64
                }
            ]
        }
        
    headers = {
        "Authorization": f"Bearer {resend_key}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post("https://api.resend.com/emails", json=payload, headers=headers)
        response.raise_for_status()
        print(f"Successfully sent report email to: {recipient}")
        return True
    except Exception as e:
        print(f"Failed to send email via Resend API: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"API Response: {e.response.text}")
        return False

def generate_pdf(all_data, filtered_data, last_run_str, current_run_str):
    profiles = all_data.get("profiles", []) or []
    teams = all_data.get("teams", []) or []
    hackathons = all_data.get("hackathons", []) or []
    conversation_participants = all_data.get("conversation_participants", []) or []
    conversations = all_data.get("conversations", []) or []

    profile_map = {p["id"]: p.get("full_name") or p.get("email") or p["id"] for p in profiles}
    team_map = {t["id"]: t.get("name") or t["id"] for t in teams}
    hackathon_map = {h["id"]: h.get("name") or h["id"] for h in hackathons}
    
    conv_parts_map = {}
    for cp in conversation_participants:
        c_id = cp["conversation_id"]
        u_id = cp["user_id"]
        name = profile_map.get(u_id, u_id)
        if c_id not in conv_parts_map:
            conv_parts_map[c_id] = []
        conv_parts_map[c_id].append(name)
        
    conv_desc_map = {}
    for c in conversations:
        c_id = c["id"]
        c_type = c["type"]
        if c_type == "team":
            t_id = c.get("team_id")
            t_name = team_map.get(t_id, "Unknown Team")
            conv_desc_map[c_id] = f"Team Chat: {t_name}"
        else:
            parts = conv_parts_map.get(c_id, [])
            conv_desc_map[c_id] = f"DM: {', '.join(parts)}"

    doc = SimpleDocTemplate(
        PDF_FILE,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=28,
        leading=34,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=12
    )
    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#475569"),
        spaceAfter=25
    )
    section_h1 = ParagraphStyle(
        'SectionH1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=18,
        spaceAfter=8,
        keepWithNext=True
    )
    section_h2 = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )
    body_style = ParagraphStyle(
        'ReportBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#334155")
    )
    body_bold = ParagraphStyle(
        'ReportBodyBold',
        parent=body_style,
        fontName='Helvetica-Bold'
    )
    body_small = ParagraphStyle(
        'ReportBodySmall',
        parent=body_style,
        fontSize=8,
        leading=11
    )
    header_cell = ParagraphStyle(
        'HeaderCell',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        textColor=colors.white
    )
    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#334155")
    )
    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=table_cell,
        fontName='Helvetica-Bold'
    )

    story = []

    # --- 1. COVER PAGE ---
    story.append(Spacer(1, 40))
    story.append(Paragraph("HACKERMATE", ParagraphStyle('Brand', parent=title_style, fontSize=14, textColor=colors.HexColor("#84cc16"), spaceAfter=5)))
    story.append(Paragraph("Daily Database Report", title_style))
    story.append(Paragraph("Structured view of new database activity and records.", subtitle_style))
    
    # Divider line
    d_table = Table([[""]], colWidths=[540], rowHeights=[2])
    d_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(d_table)
    story.append(Spacer(1, 25))

    meta_info = [
        [Paragraph("<b>Reporting Window & Settings</b>", body_bold), Paragraph("<b>New Activity Statistics</b>", body_bold)],
        [
            Paragraph(f"<b>From (UTC):</b> {last_run_str}<br/>"
                      f"<b>To (UTC):</b> {current_run_str}<br/>"
                      f"<b>Host:</b> db.rhryjrbebfrrfhtyyzbs.supabase.co<br/>"
                      f"<b>Database Engine:</b> PostgreSQL 17.6", body_small),
            Paragraph(f"<b>New Profiles:</b> {len(filtered_data.get('profiles', []))}<br/>"
                      f"<b>New Teams:</b> {len(filtered_data.get('teams', []))}<br/>"
                      f"<b>New Messages:</b> {len(filtered_data.get('messages', []))}<br/>"
                      f"<b>New Notifications:</b> {len(filtered_data.get('notifications', []))}", body_small)
        ]
    ]
    meta_table = Table(meta_info, colWidths=[270, 270])
    meta_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 20))

    story.append(Paragraph("Incremental Records Summary", section_h2))
    
    summary_data = [[Paragraph("Table Name", header_cell), Paragraph("New Rows", header_cell), Paragraph("Description", header_cell)]]
    for table_name, rows in filtered_data.items():
        row_count = len(rows) if rows else 0
        desc = ""
        if table_name == "profiles": desc = "New developer profiles registered"
        elif table_name == "teams": desc = "New teams created in this period"
        elif table_name == "team_members": desc = "New members added to teams"
        elif table_name == "notifications": desc = "New system alerts and push logs"
        elif table_name == "team_invites": desc = "New invites issued to builders"
        elif table_name == "hackathons": desc = "New hackathons scraped or posted"
        elif table_name == "friend_requests": desc = "New developer connection requests"
        elif table_name == "conversations": desc = "New chats or DMs initialized"
        elif table_name == "conversation_participants": desc = "New users mapping into conversations"
        elif table_name == "messages": desc = "New chat messages transmitted"
        elif table_name == "feedback": desc = "New bug reports/feedbacks received"
        elif table_name == "team_documents": desc = "Updated collaborative team pads"
        elif table_name == "team_hackathons": desc = "New team links to hackathons"
        else: desc = f"New records for {table_name}"
        
        summary_data.append([
            Paragraph(clean_xml_string(table_name), table_cell_bold),
            Paragraph(str(row_count), table_cell),
            Paragraph(desc, table_cell)
        ])

    summary_table = Table(summary_data, colWidths=[150, 80, 310])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(summary_table)
    story.append(PageBreak())

    def add_table_section(title, headers, col_widths, rows_data, row_extractor):
        story.append(Paragraph(title, section_h1))
        if not rows_data:
            story.append(Paragraph("<i>No new records recorded in this table during this reporting window.</i>", body_style))
            story.append(Spacer(1, 15))
            return

        table_data = [[Paragraph(h, header_cell) for h in headers]]
        for r in rows_data:
            extracted_cells = row_extractor(r)
            row_cells = []
            for cell_val in extracted_cells:
                row_cells.append(Paragraph(clean_xml_string(cell_val), table_cell))
            table_data.append(row_cells)

        sec_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        sec_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ('TOPPADDING', (0, 0), (-1, -1), 4.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(sec_table)
        story.append(Spacer(1, 20))

    # Profiles
    def extract_profile(p):
        return [
            p.get("id", "")[:8],
            p.get("full_name") or "-",
            p.get("email") or "-",
            truncate_str(p.get("college"), 45),
            p.get("role", "user"),
            format_date(p.get("created_at"))
        ]
    add_table_section(
        "New User Profiles (public.profiles)",
        ["ID (Short)", "Full Name", "Email", "College Affiliation", "Role", "Created At"],
        [55, 95, 120, 150, 45, 75],
        filtered_data.get("profiles", []),
        extract_profile
    )

    # Teams
    def extract_team(t):
        skills_str = ", ".join(t.get("skills") or []) if isinstance(t.get("skills"), list) else ""
        owner_name = profile_map.get(t.get("owner_id"), t.get("owner_id", ""))
        recruiting = "Yes" if t.get("is_recruiting") else "No"
        return [
            t.get("name") or "-",
            truncate_str(t.get("description"), 70),
            owner_name,
            truncate_str(t.get("college"), 35),
            truncate_str(skills_str, 30),
            recruiting
        ]
    add_table_section(
        "New Teams (public.teams)",
        ["Team Name", "Description", "Owner", "College", "Skills Needed", "Recruiting?"],
        [90, 130, 90, 110, 80, 40],
        filtered_data.get("teams", []),
        extract_team
    )

    # Team Members
    def extract_member(m):
        team_name = team_map.get(m.get("team_id"), m.get("team_id", ""))
        user_name = profile_map.get(m.get("user_id"), m.get("user_id", ""))
        return [
            team_name,
            user_name,
            m.get("role") or "-",
            m.get("project_role") or "-",
            format_date(m.get("created_at"))
        ]
    add_table_section(
        "New Team Members (public.team_members)",
        ["Team Name", "Developer", "Access Role", "Project Role", "Joined At"],
        [110, 110, 70, 150, 100],
        filtered_data.get("team_members", []),
        extract_member
    )

    # Team Hackathons
    def extract_team_hackathon(th):
        t_name = team_map.get(th.get("team_id"), th.get("team_id", ""))
        h_name = hackathon_map.get(th.get("hackathon_id"), th.get("hackathon_id", ""))
        return [t_name, h_name, format_date(th.get("created_at"))]
    add_table_section(
        "New Team-Hackathon Links (public.team_hackathons)",
        ["Team Name", "Linked Hackathon", "Linked At"],
        [200, 240, 100],
        filtered_data.get("team_hackathons", []),
        extract_team_hackathon
    )

    # Team Documents
    def extract_doc(d):
        t_name = team_map.get(d.get("team_id"), d.get("team_id", ""))
        updated_by = profile_map.get(d.get("updated_by"), d.get("updated_by", ""))
        return [t_name, truncate_str(d.get("content"), 150), updated_by, format_date(d.get("updated_at"))]
    add_table_section(
        "Updated Workspace Documents (public.team_documents)",
        ["Team Name", "Document Content Preview", "Last Updated By", "Last Updated At"],
        [110, 230, 100, 100],
        filtered_data.get("team_documents", []),
        extract_doc
    )

    # Team Invites
    def extract_invite(i):
        t_name = team_map.get(i.get("team_id"), i.get("team_id", ""))
        invitee = profile_map.get(i.get("invited_user_id"), i.get("invited_user_id", ""))
        inviter = profile_map.get(i.get("invited_by"), i.get("invited_by", ""))
        return [t_name, invitee, inviter, i.get("status", "pending"), format_date(i.get("created_at"))]
    add_table_section(
        "New Team Invites (public.team_invites)",
        ["Team Name", "Invited Developer", "Invited By", "Status", "Sent At"],
        [110, 110, 110, 90, 120],
        filtered_data.get("team_invites", []),
        extract_invite
    )

    # Hackathons
    def extract_hackathon(h):
        return [
            truncate_str(h.get("name"), 45),
            h.get("start_date") or "-",
            h.get("end_date") or "-",
            truncate_str(h.get("location"), 30),
            h.get("mode") or "-",
            h.get("prize_pool") or "-"
        ]
    add_table_section(
        "New Hackathons (public.hackathons)",
        ["Hackathon Name", "Start Date", "End Date", "Location", "Mode", "Prize Pool"],
        [180, 60, 60, 90, 50, 100],
        filtered_data.get("hackathons", []),
        extract_hackathon
    )

    # Friend Requests
    def extract_request(r):
        sender = profile_map.get(r.get("sender_id"), r.get("sender_id", ""))
        receiver = profile_map.get(r.get("receiver_id"), r.get("receiver_id", ""))
        return [sender, receiver, r.get("status", "pending"), format_date(r.get("created_at"))]
    add_table_section(
        "New Connection Requests (public.friend_requests)",
        ["Sender Developer", "Receiver Developer", "Status", "Sent At"],
        [160, 160, 100, 120],
        filtered_data.get("friend_requests", []),
        extract_request
    )

    # Conversations
    def extract_conversation(c):
        desc = conv_desc_map.get(c.get("id"), "")
        return [c.get("id", "")[:8], c.get("type") or "-", truncate_str(desc, 90), format_date(c.get("created_at"))]
    add_table_section(
        "New Conversations (public.conversations)",
        ["ID (Short)", "Type", "Details / Participants", "Created At"],
        [70, 70, 280, 120],
        filtered_data.get("conversations", []),
        extract_conversation
    )

    # Messages
    def extract_msg(m):
        conv_desc = conv_desc_map.get(m.get("conversation_id"), m.get("conversation_id", ""))
        sender = profile_map.get(m.get("sender_id"), m.get("sender_id", ""))
        return [
            truncate_str(conv_desc, 30),
            sender,
            truncate_str(m.get("content"), 80),
            format_date(m.get("created_at"))
        ]
    add_table_section(
        "New Chat Messages (public.messages)",
        ["Conversation", "Sender", "Content Preview", "Sent At"],
        [120, 110, 210, 100],
        filtered_data.get("messages", []),
        extract_msg
    )

    # Notifications
    def extract_notification(n):
        user = profile_map.get(n.get("user_id"), n.get("user_id", ""))
        read_str = "Yes" if n.get("is_read") else "No"
        return [user, truncate_str(n.get("message"), 80), read_str, format_date(n.get("created_at"))]
    add_table_section(
        "New System Notifications (public.notifications)",
        ["Recipient Developer", "Notification Message", "Read?", "Created At"],
        [110, 240, 70, 120],
        filtered_data.get("notifications", []),
        extract_notification
    )

    # Feedback
    def extract_feedback(f):
        user = profile_map.get(f.get("user_id"), "Anonymous")
        if user == "Anonymous" and f.get("user_email"):
            user = f.get("user_email")
        return [user, f.get("type", "general"), truncate_str(f.get("message"), 80), format_date(f.get("created_at"))]
    add_table_section(
        "New Feedback Submissions (public.feedback)",
        ["Submitted By / Email", "Category Type", "Message Details", "Submitted At"],
        [130, 80, 230, 100],
        filtered_data.get("feedback", []),
        extract_feedback
    )

    # Build PDF
    print("Building PDF...")
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated structured PDF report at: {PDF_FILE}")

def main():
    env = load_env()
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    resend_key = env.get("RESEND_API_KEY")
    recipient = env.get("RESEND_SANDBOX_RECIPIENT")
    
    if not all([supabase_url, service_key, resend_key, recipient]):
        print("Missing required environment configuration in .env.local or process environment")
        print(f"Supabase URL: {supabase_url is not None}")
        print(f"Service Key: {service_key is not None}")
        print(f"Resend Key: {resend_key is not None}")
        print(f"Recipient: {recipient}")
        return

    last_run_str = get_last_run(supabase_url, service_key)
    current_run_str = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    all_data = fetch_supabase_data(supabase_url, service_key)
    filtered_data = filter_incremental_data(all_data, last_run_str)
    total_new = sum(len(rows) for rows in filtered_data.values())
    
    if total_new > 0:
        generate_pdf(all_data, filtered_data, last_run_str, current_run_str)
        success = send_email_with_pdf(PDF_FILE, resend_key, recipient, filtered_data, last_run_str, current_run_str)
    else:
        success = send_email_with_pdf(None, resend_key, recipient, filtered_data, last_run_str, current_run_str)

    if success:
        save_last_run(supabase_url, service_key, current_run_str)
    else:
        print("Skipped updating last run timestamp due to email failure.")

if __name__ == "__main__":
    main()

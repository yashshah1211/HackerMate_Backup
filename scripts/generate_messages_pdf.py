import os
import sys
import html
import requests
from datetime import datetime, timezone, timedelta
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Root and script paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend") if not os.path.exists(os.path.join(PROJECT_ROOT, "src")) else PROJECT_ROOT
OUTPUT_PDF_PATH = os.path.join(PROJECT_ROOT, "HackerMate_Messages_Detailed_Report.pdf")

# Register TrueType Fonts if available
FONT_NORMAL = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_ITALIC = "Helvetica-Oblique"

try:
    if os.path.exists("C:/Windows/Fonts/segoeui.ttf") and os.path.exists("C:/Windows/Fonts/segoeuib.ttf"):
        pdfmetrics.registerFont(TTFont("SegoeUI", "C:/Windows/Fonts/segoeui.ttf"))
        pdfmetrics.registerFont(TTFont("SegoeUI-Bold", "C:/Windows/Fonts/segoeuib.ttf"))
        pdfmetrics.registerFont(TTFont("SegoeUI-Italic", "C:/Windows/Fonts/segoeuii.ttf"))
        FONT_NORMAL = "SegoeUI"
        FONT_BOLD = "SegoeUI-Bold"
        FONT_ITALIC = "SegoeUI-Italic"
    elif os.path.exists("C:/Windows/Fonts/arial.ttf") and os.path.exists("C:/Windows/Fonts/arialbd.ttf"):
        pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/arial.ttf"))
        pdfmetrics.registerFont(TTFont("Arial-Bold", "C:/Windows/Fonts/arialbd.ttf"))
        FONT_NORMAL = "Arial"
        FONT_BOLD = "Arial-Bold"
        FONT_ITALIC = "Arial"
except Exception as e:
    print(f"Font registration fallback to Helvetica: {e}")

# Color Palette
CLR_PRIMARY = colors.HexColor("#0F172A")    # Slate 900
CLR_SECONDARY = colors.HexColor("#1E293B")  # Slate 800
CLR_ACCENT = colors.HexColor("#6366F1")     # Indigo 500
CLR_BRAND = colors.HexColor("#10B981")      # Emerald / Lime Green
CLR_DM = colors.HexColor("#2563EB")         # Royal Blue
CLR_TEAM = colors.HexColor("#8B5CF6")       # Purple
CLR_BG_LIGHT = colors.HexColor("#F8FAFC")   # Slate 50
CLR_BG_CARD = colors.HexColor("#F1F5F9")    # Slate 100
CLR_BORDER = colors.HexColor("#CBD5E1")     # Slate 300
CLR_BORDER_LIGHT = colors.HexColor("#E2E8F0")
CLR_TEXT_DARK = colors.HexColor("#0F172A")
CLR_TEXT_MUTED = colors.HexColor("#64748B")  # Slate 500
CLR_TEXT_LIGHT = colors.HexColor("#FFFFFF")
CLR_UNREAD = colors.HexColor("#EF4444")      # Red 500
CLR_READ = colors.HexColor("#10B981")        # Green 500

class NumberedCanvas(canvas.Canvas):
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
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        # Top banner on all pages
        self.setFillColor(colors.HexColor("#0F172A"))
        self.rect(0, 782, 612, 10, fill=True, stroke=False)
        self.setFillColor(colors.HexColor("#10B981"))
        self.rect(0, 780, 612, 2, fill=True, stroke=False)

        # Header (pages > 1)
        if self._pageNumber > 1:
            self.setFont(FONT_BOLD, 8)
            self.setFillColor(CLR_PRIMARY)
            self.drawString(36, 762, "HACKERMATE")
            self.setFont(FONT_NORMAL, 8)
            self.setFillColor(CLR_TEXT_MUTED)
            self.drawString(100, 762, "|  Messages & Communications Audit Report")
            self.drawRightString(576, 762, "Confidential Database Export")
            self.setStrokeColor(CLR_BORDER_LIGHT)
            self.setLineWidth(0.5)
            self.line(36, 755, 576, 755)

        # Footer on all pages
        self.setStrokeColor(CLR_BORDER_LIGHT)
        self.setLineWidth(0.5)
        self.line(36, 30, 576, 30)

        self.setFont(FONT_NORMAL, 7.5)
        self.setFillColor(CLR_TEXT_MUTED)
        self.drawString(36, 18, "HackerMate Security & Communications Log")
        self.drawRightString(576, 18, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def load_env():
    env = {
        "NEXT_PUBLIC_SUPABASE_URL": os.environ.get("NEXT_PUBLIC_SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
    }
    possible_paths = [
        os.path.join(PROJECT_ROOT, ".env.local"),
        os.path.join(PROJECT_ROOT, "frontend", ".env.local"),
        os.path.join(FRONTEND_DIR, ".env.local"),
    ]
    for env_path in possible_paths:
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k in env and not env[k]:
                            env[k] = v
    return env


def sanitize_text(text):
    if text is None:
        return ""
    s = str(text)
    # Emoji replacements
    emoji_map = {
        "👍": "[Thumbs Up]",
        "👋": "[Wave]",
        "😭": "[Sob]",
        "🔥": "[Fire]",
        "🎉": "[Party]",
        "🚀": "[Rocket]",
        "❤️": "[Heart]",
        "✅": "[Check]",
        "✨": "[Sparkles]",
        "😊": "[Smile]",
        "🙌": "[Hands Up]",
        "💡": "[Idea]",
        "🤝": "[Handshake]",
    }
    for emo, rep in emoji_map.items():
        s = s.replace(emo, rep)
    
    # Strip any remaining high-surrogate or unencodable characters
    clean_chars = []
    for ch in s:
        if ord(ch) <= 0xFFFF:
            clean_chars.append(ch)
        else:
            clean_chars.append(f"[U+{ord(ch):X}]")
    s = "".join(clean_chars)
    return html.escape(s)


def format_iso_time(ts_str):
    if not ts_str:
        return "N/A"
    try:
        # e.g. 2026-07-15T13:57:06.781176+00:00
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        # Convert to local / readable UTC + IST format
        ist_dt = dt + timedelta(hours=5, minutes=30)
        return ist_dt.strftime("%d %b %Y, %I:%M %p IST")
    except Exception:
        return ts_str[:19].replace("T", " ")


def fetch_all_data():
    env = load_env()
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise ValueError("Supabase URL or Service Role Key missing in environment / .env.local")

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}"
    }

    print("Fetching data from Supabase...")
    tables = ["messages", "conversations", "conversation_participants", "profiles", "teams", "team_members"]
    data = {}
    for table in tables:
        url = f"{supabase_url}/rest/v1/{table}?select=*&order=created_at.asc" if table in ["messages", "conversations"] else f"{supabase_url}/rest/v1/{table}?select=*"
        res = requests.get(url, headers=headers)
        res.raise_for_status()
        data[table] = res.json()
        print(f"  -> Fetched {len(data[table])} rows from {table}")
    return data


def build_pdf_report():
    data = fetch_all_data()

    messages = data.get("messages", [])
    conversations = data.get("conversations", [])
    participants = data.get("conversation_participants", [])
    profiles = data.get("profiles", [])
    teams = data.get("teams", [])
    team_members = data.get("team_members", [])

    # Index lookups
    profile_map = {p["id"]: p for p in profiles}
    team_map = {t["id"]: t for t in teams}
    conv_map = {c["id"]: c for c in conversations}

    conv_participants = {}
    for p in participants:
        conv_participants.setdefault(p["conversation_id"], []).append(p["user_id"])

    team_members_map = {}
    for tm in team_members:
        team_members_map.setdefault(tm["team_id"], []).append(tm["user_id"])

    # Document setup
    doc = SimpleDocTemplate(
        OUTPUT_PDF_PATH,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=46,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    style_cover_title = ParagraphStyle(
        "CoverTitle",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=20,
        leading=24,
        textColor=CLR_PRIMARY,
        spaceAfter=4
    )
    style_cover_sub = ParagraphStyle(
        "CoverSubtitle",
        parent=styles["Normal"],
        fontName=FONT_NORMAL,
        fontSize=10,
        leading=14,
        textColor=CLR_TEXT_MUTED,
        spaceAfter=12
    )
    style_h1 = ParagraphStyle(
        "Heading1_Custom",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=13,
        leading=17,
        textColor=CLR_PRIMARY,
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )
    style_h2 = ParagraphStyle(
        "Heading2_Custom",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=10.5,
        leading=14,
        textColor=CLR_SECONDARY,
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True
    )
    style_body = ParagraphStyle(
        "Body_Custom",
        parent=styles["Normal"],
        fontName=FONT_NORMAL,
        fontSize=8.5,
        leading=11.5,
        textColor=CLR_TEXT_DARK
    )
    style_body_bold = ParagraphStyle(
        "BodyBold_Custom",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=8.5,
        leading=11.5,
        textColor=CLR_TEXT_DARK
    )
    style_muted = ParagraphStyle(
        "Muted_Custom",
        parent=styles["Normal"],
        fontName=FONT_NORMAL,
        fontSize=7.5,
        leading=10,
        textColor=CLR_TEXT_MUTED
    )
    style_msg_content = ParagraphStyle(
        "MsgContent_Custom",
        parent=styles["Normal"],
        fontName=FONT_NORMAL,
        fontSize=8.5,
        leading=12,
        textColor=CLR_TEXT_DARK
    )
    style_badge_dm = ParagraphStyle(
        "BadgeDM",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=7.5,
        leading=9,
        textColor=CLR_DM
    )
    style_badge_team = ParagraphStyle(
        "BadgeTeam",
        parent=styles["Normal"],
        fontName=FONT_BOLD,
        fontSize=7.5,
        leading=9,
        textColor=CLR_TEAM
    )

    story = []

    # ---------------------------------------------------------
    # 1. HEADER & EXECUTIVE SUMMARY
    # ---------------------------------------------------------
    story.append(Spacer(1, 4))
    story.append(Paragraph("HACKERMATE &mdash; MESSAGES AUDIT REPORT", style_cover_title))
    generated_at_str = datetime.now(timezone.utc).strftime("%d %B %Y at %I:%M %p UTC")
    ist_str = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).strftime("%d %B %Y, %I:%M %p IST")
    story.append(Paragraph(f"Comprehensive Communication & Chat Data Export &bull; Generated: {ist_str} ({generated_at_str})", style_cover_sub))
    story.append(HRFlowable(width="100%", thickness=1.5, color=CLR_PRIMARY, spaceBefore=0, spaceAfter=10))

    # Metrics calculation
    total_messages = len(messages)
    dm_messages_count = 0
    team_messages_count = 0
    unread_count = 0
    pinned_count = 0
    replies_count = 0
    unique_senders = set()
    unique_receivers = set()

    for m in messages:
        if m.get("sender_id"):
            unique_senders.add(m["sender_id"])
        if not m.get("is_read"):
            unread_count += 1
        if m.get("is_pinned"):
            pinned_count += 1
        if m.get("reply_to_id"):
            replies_count += 1
        
        cid = m.get("conversation_id")
        conv = conv_map.get(cid, {})
        ctype = conv.get("type", "dm")
        if ctype == "dm":
            dm_messages_count += 1
            for uid in conv_participants.get(cid, []):
                if uid != m.get("sender_id"):
                    unique_receivers.add(uid)
        else:
            team_messages_count += 1
            tid = conv.get("team_id")
            for uid in team_members_map.get(tid, []):
                if uid != m.get("sender_id"):
                    unique_receivers.add(uid)

    earliest_date = messages[0]["created_at"] if messages else None
    latest_date = messages[-1]["created_at"] if messages else None

    # Summary Dashboard KPI Grid
    kpi_data = [
        [
            Paragraph(f"<b>Total Messages</b><br/><font size=13 color='{CLR_PRIMARY.hexval()}'><b>{total_messages}</b></font>", style_body),
            Paragraph(f"<b>Direct Messages (1-on-1)</b><br/><font size=13 color='{CLR_DM.hexval()}'><b>{dm_messages_count}</b></font>", style_body),
            Paragraph(f"<b>Team Chat Messages</b><br/><font size=13 color='{CLR_TEAM.hexval()}'><b>{team_messages_count}</b></font>", style_body),
            Paragraph(f"<b>Total Conversations</b><br/><font size=13 color='{CLR_SECONDARY.hexval()}'><b>{len(conversations)}</b></font>", style_body),
        ],
        [
            Paragraph(f"<b>Unique Senders</b><br/><font size=11 color='{CLR_PRIMARY.hexval()}'><b>{len(unique_senders)} users</b></font>", style_body),
            Paragraph(f"<b>Unique Recipients</b><br/><font size=11 color='{CLR_PRIMARY.hexval()}'><b>{len(unique_receivers)} users</b></font>", style_body),
            Paragraph(f"<b>Unread / Replies</b><br/><font size=11 color='{CLR_UNREAD.hexval()}'><b>{unread_count}</b> unread / <b>{replies_count}</b> replies</font>", style_body),
            Paragraph(f"<b>Date Range</b><br/><font size=7.5 color='{CLR_TEXT_MUTED.hexval()}'>{format_iso_time(earliest_date)[:11]} &ndash; {format_iso_time(latest_date)[:11]}</font>", style_body),
        ]
    ]

    t_kpi = Table(kpi_data, colWidths=[135, 135, 135, 135])
    t_kpi.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CLR_BG_LIGHT),
        ('BOX', (0, 0), (-1, -1), 1, CLR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, CLR_BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t_kpi)
    story.append(Spacer(1, 14))

    # ---------------------------------------------------------
    # 2. SECTION 1: CONVERSATION THREADS VIEW (Grouped Dialogue)
    # ---------------------------------------------------------
    story.append(Paragraph("1. Communication Threads (Grouped by Dialogue)", style_h1))
    story.append(Paragraph(
        "Each conversation is organized chronologically as a dialogue thread between senders and receivers with complete unfiltered text.",
        style_muted
    ))
    story.append(Spacer(1, 6))

    # Group messages by conversation
    messages_by_conv = {}
    for m in messages:
        messages_by_conv.setdefault(m["conversation_id"], []).append(m)

    # Sort conversations by number of messages descending
    sorted_conv_ids = sorted(
        messages_by_conv.keys(),
        key=lambda cid: len(messages_by_conv[cid]),
        reverse=True
    )

    conv_index = 0
    for cid in sorted_conv_ids:
        conv_index += 1
        conv = conv_map.get(cid, {})
        ctype = conv.get("type", "dm").upper()
        c_msgs = messages_by_conv[cid]
        
        # Determine participants and team info
        header_color = CLR_DM if ctype == "DM" else CLR_TEAM
        bg_header_color = colors.HexColor("#EFF6FF") if ctype == "DM" else colors.HexColor("#F5F3FF")

        if ctype == "DM":
            uids = conv_participants.get(cid, [])
            p_names = []
            for uid in uids:
                p = profile_map.get(uid)
                if p:
                    p_names.append(f"<b>{sanitize_text(p.get('full_name') or 'Unnamed User')}</b> ({sanitize_text(p.get('email') or 'No email')})")
                else:
                    p_names.append(f"<b>User {uid[:8]}...</b>")
            participants_str = " &harr; ".join(p_names) if p_names else "Direct Message"
            conv_title = f"Thread #{conv_index} [Direct Message &bull; 1-on-1]: {participants_str}"
        else:
            tid = conv.get("team_id")
            team = team_map.get(tid)
            team_name = team.get("name") if team else f"Team {str(tid)[:8]}..."
            t_members = team_members_map.get(tid, [])
            member_names = [sanitize_text(profile_map.get(uid, {}).get("full_name") or "User") for uid in t_members[:4]]
            if len(t_members) > 4:
                member_names.append(f"+{len(t_members)-4} more")
            conv_title = f"Thread #{conv_index} [Team Chat &bull; {sanitize_text(team_name)}]: Members: {', '.join(member_names)}"

        # Conversation Header Box
        thread_header_table = Table(
            [[
                Paragraph(f"<font color='{header_color.hexval()}'><b>{conv_title}</b></font>", style_body_bold),
                Paragraph(f"<font color='{CLR_TEXT_MUTED.hexval()}'><b>{len(c_msgs)} message{'s' if len(c_msgs) > 1 else ''}</b></font>", ParagraphStyle("RightMuted", parent=style_muted, alignment=2))
            ]],
            colWidths=[420, 120]
        )
        thread_header_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), bg_header_color),
            ('BOX', (0, 0), (-1, -1), 0.75, header_color),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))

        thread_elements = [thread_header_table, Spacer(1, 4)]

        # Render messages in this thread
        for idx, m in enumerate(c_msgs, start=1):
            sender_id = m.get("sender_id")
            sender = profile_map.get(sender_id, {})
            sender_name = sender.get("full_name") or f"User {sender_id[:8]}"
            sender_email = sender.get("email") or ""
            sender_role = sender.get("role") or sender.get("college") or ""

            # Determine receiver
            if ctype == "DM":
                uids = conv_participants.get(cid, [])
                recipients = [uid for uid in uids if uid != sender_id]
                if recipients:
                    r_prof = profile_map.get(recipients[0], {})
                    receiver_name = r_prof.get("full_name") or f"User {recipients[0][:8]}"
                    receiver_email = r_prof.get("email") or ""
                    receiver_str = f"<b>{sanitize_text(receiver_name)}</b>" + (f" ({sanitize_text(receiver_email)})" if receiver_email else "")
                else:
                    receiver_str = "<i>Direct Message Participant</i>"
            else:
                tid = conv.get("team_id")
                team = team_map.get(tid)
                receiver_str = f"<b>Team {sanitize_text(team.get('name') if team else 'Channel')}</b>"

            timestamp_str = format_iso_time(m.get("created_at"))
            is_read = m.get("is_read")
            status_badge = f"<font color='{CLR_READ.hexval()}'>Read</font>" if is_read else f"<font color='{CLR_UNREAD.hexval()}'>Unread</font>"
            if m.get("reply_to_id"):
                status_badge += " &bull; <i>Reply</i>"
            if m.get("is_pinned"):
                status_badge += " &bull; <b>Pinned</b>"

            raw_msg_content = m.get("content", "")
            formatted_content = sanitize_text(raw_msg_content).replace("\n", "<br/>")

            sender_meta = f"<b>From:</b> <font color='{CLR_PRIMARY.hexval()}'>{sanitize_text(sender_name)}</font>"
            if sender_email:
                sender_meta += f" <font color='{CLR_TEXT_MUTED.hexval()}'>({sanitize_text(sender_email)})</font>"
            if sender_role:
                sender_meta += f" <font size=7 color='{CLR_TEXT_MUTED.hexval()}'>[{sanitize_text(sender_role)}]</font>"

            msg_meta_html = (
                f"{sender_meta} &nbsp;&rarr;&nbsp; <b>To:</b> {receiver_str}<br/>"
                f"<font size=7.5 color='{CLR_TEXT_MUTED.hexval()}'><b>Sent:</b> {timestamp_str} &nbsp;|&nbsp; <b>Status:</b> {status_badge} &nbsp;|&nbsp; <b>Msg ID:</b> <font face='Courier' size=6.5>{m.get('id')[:13]}...</font></font>"
            )

            msg_box_data = [
                [Paragraph(msg_meta_html, style_body)],
                [Paragraph(f"<font size=9>{formatted_content}</font>", style_msg_content)]
            ]

            msg_table = Table(msg_box_data, colWidths=[540])
            msg_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), CLR_BG_CARD),
                ('BACKGROUND', (0, 1), (-1, 1), colors.white),
                ('BOX', (0, 0), (-1, -1), 0.5, CLR_BORDER_LIGHT),
                ('LINEBELOW', (0, 0), (-1, 0), 0.5, CLR_BORDER_LIGHT),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ]))

            thread_elements.append(msg_table)
            thread_elements.append(Spacer(1, 3))

        thread_elements.append(Spacer(1, 6))
        story.append(KeepTogether(thread_elements))

    # ---------------------------------------------------------
    # 3. SECTION 2: COMPLETE CHRONOLOGICAL MASTER AUDIT TABLE
    # ---------------------------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("2. Master Chronological Audit Log (All 150 Messages)", style_h1))
    story.append(Paragraph(
        "Exhaustive line-by-line chronological registry of every single message in the system with exact timestamps, sender profiles, recipient targets, and complete full message contents.",
        style_muted
    ))
    story.append(Spacer(1, 8))

    table_headers = [
        Paragraph("<b># &bull; Time</b>", style_body_bold),
        Paragraph("<b>Type</b>", style_body_bold),
        Paragraph("<b>Sender (From)</b>", style_body_bold),
        Paragraph("<b>Receiver (To)</b>", style_body_bold),
        Paragraph("<b>Full Message Content</b>", style_body_bold),
        Paragraph("<b>Status</b>", style_body_bold),
    ]

    master_table_rows = [table_headers]

    for idx, m in enumerate(messages, start=1):
        sender_id = m.get("sender_id")
        sender = profile_map.get(sender_id, {})
        sender_name = sender.get("full_name") or f"User {sender_id[:8]}"
        sender_email = sender.get("email") or ""

        cid = m.get("conversation_id")
        conv = conv_map.get(cid, {})
        ctype = conv.get("type", "dm").upper()

        if ctype == "DM":
            uids = conv_participants.get(cid, [])
            recipients = [uid for uid in uids if uid != sender_id]
            if recipients:
                r_prof = profile_map.get(recipients[0], {})
                receiver_name = r_prof.get("full_name") or f"User {recipients[0][:8]}"
                receiver_email = r_prof.get("email") or ""
                receiver_display = f"<b>{sanitize_text(receiver_name)}</b>" + (f"<br/><font size=6.5 color='{CLR_TEXT_MUTED.hexval()}'>{sanitize_text(receiver_email)}</font>" if receiver_email else "")
            else:
                receiver_display = "<i>DM Participant</i>"
            type_cell = Paragraph("<font color='#2563EB'><b>DM</b></font>", style_badge_dm)
        else:
            tid = conv.get("team_id")
            team = team_map.get(tid)
            t_name = team.get("name") if team else f"Team {str(tid)[:8]}"
            receiver_display = f"<b>Team: {sanitize_text(t_name)}</b>"
            type_cell = Paragraph("<font color='#8B5CF6'><b>TEAM</b></font>", style_badge_team)

        sender_display = f"<b>{sanitize_text(sender_name)}</b>" + (f"<br/><font size=6.5 color='{CLR_TEXT_MUTED.hexval()}'>{sanitize_text(sender_email)}</font>" if sender_email else "")

        time_cell_str = f"<b>#{idx}</b><br/><font size=6.5 color='{CLR_TEXT_MUTED.hexval()}'>{format_iso_time(m.get('created_at'))}</font>"
        time_cell = Paragraph(time_cell_str, style_body)

        raw_content = m.get("content", "")
        clean_content = sanitize_text(raw_content).replace("\n", "<br/>")
        content_cell = Paragraph(f"<font size=8>{clean_content}</font>", style_body)

        is_read = m.get("is_read")
        status_text = f"<font color='{CLR_READ.hexval()}'><b>Read</b></font>" if is_read else f"<font color='{CLR_UNREAD.hexval()}'><b>Unread</b></font>"
        if m.get("reply_to_id"):
            status_text += "<br/><font size=6.5 color='#6366F1'>Reply</font>"
        status_cell = Paragraph(status_text, style_body)

        master_table_rows.append([
            time_cell,
            type_cell,
            Paragraph(sender_display, style_body),
            Paragraph(receiver_display, style_body),
            content_cell,
            status_cell
        ])

    # 540 pt total width across 6 columns
    col_widths = [68, 32, 105, 105, 185, 45]
    master_table = Table(master_table_rows, colWidths=col_widths, repeatRows=1)
    
    table_styles = [
        ('BACKGROUND', (0, 0), (-1, 0), CLR_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, 0), 5),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
        ('TOPPADDING', (0, 1), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('BOX', (0, 0), (-1, -1), 0.5, CLR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, CLR_BORDER_LIGHT),
    ]

    # Alternate row colors
    for r in range(1, len(master_table_rows)):
        if r % 2 == 0:
            table_styles.append(('BACKGROUND', (0, r), (-1, r), CLR_BG_LIGHT))

    master_table.setStyle(TableStyle(table_styles))
    story.append(master_table)

    print("Building PDF document...")
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"SUCCESS: PDF Report successfully generated at: {OUTPUT_PDF_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_PDF_PATH)} bytes")
    return OUTPUT_PDF_PATH

if __name__ == "__main__":
    build_pdf_report()

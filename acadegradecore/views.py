# acadegradecore/views.py
from django.shortcuts import render

import os
# for Firebase Admin SDK
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials


# for advanced email with HTML support
from django.core.mail import EmailMultiAlternatives

# to access email settings
from django.conf import settings

# for the login sync endpoint
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

# import the ContactMessage model
from .models import ContactMessage

# for JSON parsing
import json



# import the UserProfile model for user sync
from .models import UserProfile
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import get_object_or_404
from .models import UserProfile, ResultSheet, Year, Semester, Course

from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required

from django.http import HttpResponse
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4


from decouple import config


# Home page
def home(request):
    return render(request, "home.html")

# About page
def about(request):
    return render(request, "about.html")

# Contact page with form handling and email notifications
def contact(request):
    status = None
    name = ""

    if request.method == "POST":
        name = request.POST.get("name")
        email = request.POST.get("email")
        message = request.POST.get("message")

        try:
            # ✅ Save in DB
            if name and email and message:
                ContactMessage.objects.create(
                    name=name, email=email, message=message
                )

            # ✅ Send notification to admin (plain text)
            admin_subject = f"📩 New Contact Message from {name}"
            admin_body = f"Name: {name}\nEmail: {email}\n\nMessage:\n{message}"

            admin_email = EmailMultiAlternatives(
                subject=admin_subject,
                body=admin_body,
                from_email=settings.EMAIL_HOST_USER,
                to=[settings.EMAIL_HOST_USER],
            )
            admin_email.send(fail_silently=False)

            # ✅ Send confirmation to the user (HTML)
            user_subject = "✅ We received your message"
            text_body = f"Hello {name},\n\nThanks for reaching out! We got your message:\n\n{message}\n\nWe'll reply soon.\n\n- AcadeGrade Team"
            
            html_body = f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="text-align:center; margin-bottom:20px;">
                        <h2 style="color: #007bff;">Hi {name},</h2>
                        <p>✅ Thanks for reaching out! We got your message:</p>
                        <blockquote style="border-left: 3px solid #007bff; padding-left: 10px; color: #555;">
                            {message}
                        </blockquote>
                        <p>We’ll get back to you as soon as possible.</p>
                        <p style="margin-top:20px;">Best regards,<br><strong>AcadeGrade Team</strong></p>
                    </div>
                </body>
            </html>
            """

            user_email = EmailMultiAlternatives(
                subject=user_subject,
                body=text_body,  # fallback for clients that don’t support HTML
                from_email=settings.EMAIL_HOST_USER,
                to=[email],
            )
            user_email.attach_alternative(html_body, "text/html")
            user_email.send(fail_silently=False)

            status = "success"

        except Exception as e:
            print("❌ Email sending failed:", e)
            status = "error"

    return render(request, "contact.html", {"status": status, "name": name})


def verify_firebase_token(request):
    """Verify Firebase ID token from Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    id_token = auth_header.split(" ")[1]
    try:
        decoded = firebase_auth.verify_id_token(id_token)
        return decoded  # contains 'uid', 'email', etc.
    except Exception as e:
        print("❌ Token verification failed:", e)
        return None


@csrf_exempt
def sync_user(request):
    if request.method == "POST":
        decoded = verify_firebase_token(request)
        if not decoded:
            return JsonResponse({"error": "Invalid or missing token"}, status=401)

        try:
            data = json.loads(request.body.decode("utf-8"))
            uid = decoded.get("uid")
            email = decoded.get("email")
            name = data.get("name") or decoded.get("name") or ""

            if not uid or not email:
                return JsonResponse({"error": "Missing uid or email"}, status=400)

            profile, created = UserProfile.objects.update_or_create(
                uid=uid,
                defaults={"name": name, "email": email}
            )

            return JsonResponse({
                "status": "success",
                "created": created,
                "user": {
                    "uid": profile.uid,
                    "name": profile.name,
                    "email": profile.email,
                }
            })
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse({"error": "Invalid request"}, status=405)

# Firebase login sync endpoint for Django session login
@csrf_exempt
def firebase_login_sync(request):
    """
    POST /firebase-login-sync/
    Accepts: { idToken: <Firebase ID token> }
    Verifies token, gets/creates Django user, logs in via session.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Invalid request method"}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8"))
        id_token = data.get("idToken")
        if not id_token:
            return JsonResponse({"error": "Missing idToken"}, status=400)

        decoded = None
        try:
            decoded = firebase_auth.verify_id_token(id_token)
        except Exception as e:
            print("❌ Firebase token verification failed:", e)
            return JsonResponse({"error": "Invalid Firebase token"}, status=401)

        uid = decoded.get("uid")
        email = decoded.get("email")
        name = decoded.get("name") or ""
        if not uid or not email:
            return JsonResponse({"error": "Missing uid or email in token"}, status=400)

        # Get or create Django user
        from django.contrib.auth import get_user_model, login
        User = get_user_model()
        user, created = User.objects.get_or_create(username=uid, defaults={"email": email, "first_name": name})

        # Log in user via Django session
        login(request, user)

        # Optionally sync UserProfile, handling unique email constraint
        from .models import UserProfile
        try:
            profile, _ = UserProfile.objects.update_or_create(uid=uid, defaults={"name": name, "email": email})
        except Exception as e:
            # If email already exists, update UID for that profile
            try:
                profile = UserProfile.objects.get(email=email)
                profile.uid = uid
                profile.name = name
                profile.save()
            except UserProfile.DoesNotExist:
                # If not found, create new profile
                profile = UserProfile.objects.create(uid=uid, name=name, email=email)

        return JsonResponse({"success": True, "redirect": "/dashboard/"})
    except Exception as e:
        print("❌ firebase_login_sync error:", e)
        return JsonResponse({"error": str(e)}, status=500)

# Dashboard view (requires login)
@login_required(login_url="/")
def dashboard(request):
    return render(request, "dashboard.html")


@csrf_exempt
def create_sheet(request):
    """
    POST JSON:
    {
      "uid": "...",            # Firebase UID of owner
      "student_name": "John Doe",
      "university": "...",
      "faculty": "...",
      "department": "...",
      "years_of_study": 4,
      "semesters_per_year": 2,
      "entry_year": "2021/2022",
      "mode": "zeros" # or "available"
    }
    """
    if request.method != "POST":
        return JsonResponse({"error":"POST only"}, status=405)

    try:
        payload = json.loads(request.body)
        print("[DEBUG] create_sheet payload:", payload)
        uid = payload.get("uid")
        owner = get_object_or_404(UserProfile, uid=uid)

        sheet = ResultSheet.objects.create(
            owner=owner,
            student_name=payload.get("student_name", "Unnamed"),
            university=payload.get("university",""),
            faculty=payload.get("faculty",""),
            department=payload.get("department",""),
            years_of_study=int(payload.get("years_of_study", 4)),
            semesters_per_year=int(payload.get("semesters_per_year", 2)),
            entry_year=payload.get("entry_year",""),
            mode=payload.get("mode","zeros")
        )

        # generate years and semesters
        years = sheet.years_of_study
        semesters_per_year = sheet.semesters_per_year
        entry = sheet.entry_year.strip()  # e.g. "2021/2022"
        # parse starting year string for label generation
        start_left = None
        if entry and '/' in entry:
            try:
                start_left = int(entry.split('/')[0])
            except:
                start_left = None

        for y in range(1, years+1):
            if start_left:
                left = start_left + (y-1)
                right = left + 1
                label = f"{left}/{right} Year {y}"
            else:
                label = f"Year {y}"

            year_obj = Year.objects.create(sheet=sheet, index=y, year_label=label)

            for sidx in range(1, semesters_per_year+1):
                sem_label = f"{sidx}{'st' if sidx==1 else 'nd' if sidx==2 else 'th'} Semester"
                sem_obj = Semester.objects.create(year=year_obj, index=sidx, label=sem_label)
                # If mode is 'zeros', auto-create 1 zeroed course per semester
                if sheet.mode == 'zeros':
                    Course.objects.create(
                        semester=sem_obj,
                        code=f"C code 1",
                        title=f"C title 1",
                        credit_unit=1,
                        incourse=0,
                        exam=0
                    )

        return JsonResponse({"status":"ok","sheet_id": sheet.id})

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def update_sheet(request, sheet_id):
    """
    PUT /api/update-sheet/<id>/
    JSON: { "uid": "...", "student_name": "...", "university": "...", ... }
    """
    if request.method != "PUT":
        return JsonResponse({"error": "PUT only"}, status=405)

    try:
        payload = json.loads(request.body)
        print(f"[DEBUG] update_sheet payload for sheet_id={sheet_id}:", payload)
        uid = payload.get("uid")
        if not uid:
            return JsonResponse({"error": "uid required"}, status=400)

        sheet = ResultSheet.objects.get(id=sheet_id, owner__uid=uid)

        # Update fields
        sheet.student_name = payload.get("student_name", sheet.student_name)
        sheet.university = payload.get("university", sheet.university)
        sheet.faculty = payload.get("faculty", sheet.faculty)
        sheet.department = payload.get("department", sheet.department)
        sheet.entry_year = payload.get("entry_year", sheet.entry_year)
        sheet.mode = payload.get("mode", sheet.mode)
        sheet.save()

        return JsonResponse({"status": "ok"})
    except ResultSheet.DoesNotExist:
        return JsonResponse({"error": "Sheet not found or not yours"}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def sheet_detail_api(request, sheet_id):
    """
    GET /api/sheet/<id>/
    Returns details of a single sheet (basic info only)
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)

    try:
        sheet = ResultSheet.objects.get(id=sheet_id)
        data = {
            "id": sheet.id,
            "student_name": sheet.student_name,
            "university": sheet.university,
            "faculty": sheet.faculty,
            "department": sheet.department,
            "entry_year": sheet.entry_year,
            "mode": sheet.mode,
            "years_of_study": sheet.years_of_study,
            "semesters_per_year": sheet.semesters_per_year,
        }
        return JsonResponse(data)
    except ResultSheet.DoesNotExist:
        return JsonResponse({"error": "Sheet not found"}, status=404)


@csrf_exempt
def add_course(request):
    """
    Add a course to a semester (POST)
    JSON:
    { "semester_id": 3, "code": "...", "title": "...", "credit_unit": 3, "incourse": 12, "exam": 58 }
    """
    if request.method != "POST":
        return JsonResponse({"error":"POST only"}, status=405)
    try:
        payload = json.loads(request.body)
        semester_id = int(payload.get("semester_id"))
        sem = Semester.objects.get(id=semester_id)

        c = Course.objects.create(
            semester=sem,
            code=payload.get("code",""),
            title=payload.get("title",""),
            credit_unit=int(payload.get("credit_unit",0)),
            incourse=int(payload.get("incourse",0)),
            exam=int(payload.get("exam",0))
        )
        return JsonResponse({"status":"ok","course_id": c.id})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


# --- Batch Course API ---
@csrf_exempt
def get_semester_courses(request, semester_id):
    """
    GET /api/semester/<id>/courses/
    Returns all courses for a semester (for batch modal)
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)
    try:
        sem = Semester.objects.get(id=semester_id)
        courses = [
            {
                "id": c.id,
                "code": c.code,
                "title": c.title,
                "credit_unit": c.credit_unit,
                "incourse": c.incourse,
                "exam": c.exam
            }
            for c in sem.courses.all()
        ]
        return JsonResponse({"courses": courses})
    except Semester.DoesNotExist:
        return JsonResponse({"courses": []})

@csrf_exempt
def batch_add_courses(request):
    """
    POST /api/batch-add-courses/
    JSON: { "semester_id": <id>, "courses": [ {...}, ... ] }
    Adds/replaces all courses for a semester.
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    try:
        payload = json.loads(request.body)
        semester_id = int(payload.get("semester_id"))
        courses_data = payload.get("courses", [])
        sem = Semester.objects.get(id=semester_id)
        # Remove existing courses (for replace semantics)
        sem.courses.all().delete()
        # Add new courses
        for cdata in courses_data:
            Course.objects.create(
                semester=sem,
                code=cdata.get("code", ""),
                title=cdata.get("title", ""),
                credit_unit=int(cdata.get("credit_unit", 0)),
                incourse=int(cdata.get("incourse", 0)),
                exam=int(cdata.get("exam", 0))
            )
        return JsonResponse({"status": "ok"})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def course_detail(request, course_id):
    """
    GET /api/course/<id>/
    Returns details of a single course
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)

    try:
        course = Course.objects.get(id=course_id)
        data = {
            "id": course.id,
            "code": course.code,
            "title": course.title,
            "credit_unit": course.credit_unit,
            "incourse": course.incourse,
            "exam": course.exam,
            "score": course.score,
            "grade": course.grade,
            "grade_point": course.grade_point,
        }
        return JsonResponse(data)
    except Course.DoesNotExist:
        return JsonResponse({"error": "Course not found"}, status=404)


@csrf_exempt
def update_course(request, course_id):
    """
    PUT /api/update-course/<id>/
    JSON: { "code": "...", "title": "...", "credit_unit": 3, "incourse": 20, "exam": 60 }
    """
    if request.method != "PUT":
        return JsonResponse({"error": "PUT only"}, status=405)

    try:
        payload = json.loads(request.body)
        course = Course.objects.get(id=course_id)

        # Update fields
        course.code = payload.get("code", course.code)
        course.title = payload.get("title", course.title)
        course.credit_unit = int(payload.get("credit_unit", course.credit_unit))
        course.incourse = int(payload.get("incourse", course.incourse))
        course.exam = int(payload.get("exam", course.exam))
        course.save()

        return JsonResponse({"status": "ok"})
    except Course.DoesNotExist:
        return JsonResponse({"error": "Course not found"}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

# New: Delete course endpoint
@csrf_exempt
def delete_course(request, course_id):
    """
    DELETE /api/delete-course/<id>/?uid=<firebase_uid>
    """
    if request.method != "DELETE":
        return JsonResponse({"error": "DELETE only"}, status=405)

    uid = request.GET.get("uid")
    if not uid:
        return JsonResponse({"error": "uid required"}, status=400)

    try:
        course = Course.objects.get(id=course_id)
        # Check ownership via course.semester.year.sheet.owner.uid
        if course.semester.year.sheet.owner.uid != uid:
            return JsonResponse({"error": "Not authorized"}, status=403)
        course.delete()
        return JsonResponse({"status": "ok"})
    except Course.DoesNotExist:
        return JsonResponse({"error": "Course not found"}, status=404)


def sheet_detail(request, sheet_id):
    """
    Return sheet + years + semesters + courses summary (GET)
    """
    sheet = get_object_or_404(ResultSheet, id=sheet_id)
    data = {
        "id": sheet.id,
        "student_name": sheet.student_name,
        "university": sheet.university,
        "faculty": sheet.faculty,
        "department": sheet.department,
        "years_of_study": sheet.years_of_study,
        "semesters_per_year": sheet.semesters_per_year,
        "entry_year": sheet.entry_year,
        "mode": sheet.mode,
        "cgpa": sheet.cgpa,
        "years": []
    }
    for year in sheet.years.all():
        ydata = {"id": year.id, "index": year.index, "year_label": year.year_label, "year_gpa": year.year_gpa, "semesters": []}
        for sem in year.semesters.all():
            semdata = {"id": sem.id, "index": sem.index, "label": sem.label, "gpa": sem.gpa, "courses": []}
            for c in sem.courses.all():
                semdata["courses"].append({
                    "id": c.id, "code": c.code, "title": c.title,
                    "credit_unit": c.credit_unit, "incourse": c.incourse,
                    "exam": c.exam, "score": c.score, "grade": c.grade, "grade_point": c.grade_point
                })
            ydata["semesters"].append(semdata)
        data["years"].append(ydata)
    return JsonResponse(data)

@csrf_exempt
def list_sheets(request):
    """
    GET /api/list-sheets/?uid=<firebase_uid>
    Return all sheets for a user.
    """
    uid = request.GET.get("uid")
    if not uid:
        return JsonResponse({"error": "uid required"}, status=400)

    try:
        user = UserProfile.objects.get(uid=uid)
    except UserProfile.DoesNotExist:
        return JsonResponse({"sheets": []})

    sheets = []
    for sheet in user.sheets.all():
        sheets.append({
            "id": sheet.id,
            "student_name": sheet.student_name,
            "university": sheet.university,
            "faculty": sheet.faculty,
            "department": sheet.department,
            "years_of_study": sheet.years_of_study,
            "semesters_per_year": sheet.semesters_per_year,
            "entry_year": sheet.entry_year,
            "mode": sheet.mode,
            "cgpa": sheet.cgpa,
        })

    return JsonResponse({"sheets": sheets})

@csrf_exempt
def delete_sheet(request, sheet_id):
    """
    DELETE /api/delete-sheet/<id>/?uid=<firebase_uid>
    """
    if request.method != "DELETE":
        return JsonResponse({"error": "DELETE only"}, status=405)

    uid = request.GET.get("uid")
    if not uid:
        return JsonResponse({"error": "uid required"}, status=400)

    try:
        sheet = ResultSheet.objects.get(id=sheet_id, owner__uid=uid)
        sheet.delete()
        return JsonResponse({"status": "ok"})
    except ResultSheet.DoesNotExist:
        return JsonResponse({"error": "Sheet not found or not yours"}, status=404)


def export_pdf(request, sheet_id):
    # Fetch the sheet
    sheet = ResultSheet.objects.get(id=sheet_id)

    # Prepare response
    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="ResultSheet_{sheet.student_name}.pdf"'

    # Create PDF
    doc = SimpleDocTemplate(response, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # --- Branding header ---
    title_style = ParagraphStyle(
        "title",
        parent=styles["Heading1"],
        alignment=1,
        fontSize=18,
        spaceAfter=12,
    )
    story.append(Paragraph("🎓 AcadeGrade", title_style))
    story.append(Spacer(1, 12))

    # --- Student info ---
    info = f"""
    <b>Student:</b> {sheet.student_name}<br/>
    <b>University:</b> {sheet.university or '-'}<br/>
    <b>Faculty:</b> {sheet.faculty or '-'}<br/>
    <b>Department:</b> {sheet.department or '-'}<br/>
    <b>Entry Year:</b> {sheet.entry_year}<br/>
    <b>Years of Study:</b> {sheet.years_of_study} <br/>
    <b>Semesters/Year:</b> {sheet.semesters_per_year} <br/>
    <b>Mode:</b> {"Build-up (Zeros)" if sheet.mode == "zeros" else "Availability"}<br/>
    """
    story.append(Paragraph(info, styles["Normal"]))
    story.append(Spacer(1, 12))

    # --- Year by year breakdown ---
    years = {}
    for semester in sheet.semester_set.all().order_by("id"):
        year_index = (semester.index // sheet.semesters_per_year) + 1
        years.setdefault(year_index, []).append(semester)

    for year, semesters in years.items():
        # Year heading
        story.append(Paragraph(f"<b>Year {year}</b>", styles["Heading2"]))
        story.append(Spacer(1, 6))

        year_total_points = 0
        year_total_units = 0

        for sem in semesters:
            story.append(Paragraph(f"<u>{sem.label}</u>", styles["Heading3"]))
            table_data = [["Code", "Title", "Unit", "Score", "Grade"]]

            sem_total_points = 0
            sem_total_units = 0

            for course in sem.course_set.all():
                table_data.append([
                    course.code,
                    course.title,
                    str(course.credit_unit),
                    str(course.score),
                    course.grade,
                ])
                sem_total_units += course.credit_unit
                sem_total_points += course.credit_unit * course.grade_point

            # Add semester table
            table = Table(table_data, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0d6efd")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            story.append(table)

            # Semester GPA
            sem_gpa = sem_total_points / sem_total_units if sem_total_units else 0
            story.append(Paragraph(f"<b>Semester GPA:</b> {sem_gpa:.2f}", styles["Normal"]))
            story.append(Spacer(1, 6))

            year_total_points += sem_total_points
            year_total_units += sem_total_units

        # Year GPA summary
        year_gpa = year_total_points / year_total_units if year_total_units else 0
        story.append(Paragraph(f"<b>Year {year} GPA:</b> {year_gpa:.2f}", styles["Heading3"]))
        story.append(Spacer(1, 12))

    # --- Overall CGPA ---
    cgpa = getattr(sheet, "cgpa", 0.0)
    story.append(Paragraph(f"<b>Total CGPA:</b> {cgpa:.2f}", styles["Heading2"]))

    # Build document
    doc.build(story)
    return response










# from django.shortcuts import render
# from django.core.mail import send_mail
# from django.conf import settings
# from .models import ContactMessage
# # Home page
# def home(request):
#     return render(request, "home.html")

# # About page
# def about(request):
#     return render(request, "about.html")

# # Contact page with form handling and email notifications
# def contact(request):
#     status = None   # 🔹 default state
#     name = ""

#     if request.method == "POST":
#         name = request.POST.get("name")
#         email = request.POST.get("email")
#         message = request.POST.get("message")

#         try:
#             # ✅ Save in DB
#             if name and email and message:
#                 ContactMessage.objects.create(
#                     name=name, email=email, message=message
#                 )

#             # ✅ Send notification to admin (you)
#             send_mail(
#                 subject=f"📩 New Contact Message from {name}",
#                 message=f"Name: {name}\nEmail: {email}\n\nMessage:\n{message}",
#                 from_email=settings.EMAIL_HOST_USER,
#                 recipient_list=[settings.EMAIL_HOST_USER],
#                 fail_silently=False,
#             )

#             # ✅ Send confirmation to the user
#             send_mail(
#                 subject="✅ We received your message",
#                 message=(
#                     f"Hello {name},\n\n"
#                     f"Thanks for reaching out! We got your message:\n\n{message}\n\n"
#                     f"We'll reply soon.\n\n- AcadeGrade Team"
#                 ),
#                 from_email=settings.EMAIL_HOST_USER,
#                 recipient_list=[email],
#                 fail_silently=False,
#             )

#             status = "success"

#         except Exception as e:
#             print("❌ Email sending failed:", e)
#             status = "error"

#     return render(request, "contact.html", {"status": status, "name": name})

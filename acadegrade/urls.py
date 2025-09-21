"""
URL configuration for acadegrade project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin # Admin panel
from django.urls import path # URL routing
from acadegradecore import views

urlpatterns = [
    path("admin/", admin.site.urls), # Admin panel
    path("", views.home, name="home"), # Home page
    path("about/", views.about, name="about"), # About page
    path("contact/", views.contact, name="contact"), # Contact page
    path("sync-user/", views.sync_user, name="sync_user"),  # 🔹 NEW: Import csrf_exempt to allow POST requests from external clients
    path("dashboard/", views.dashboard, name="dashboard"), # User dashboard

    # Firebase login sync endpoint
    path("firebase-login-sync/", views.firebase_login_sync, name="firebase_login_sync"),

    # API endpoints
    path("api/create-sheet/", views.create_sheet, name="create_sheet"),
    path("api/delete-sheet/<int:sheet_id>/", views.delete_sheet, name="delete_sheet"),
    path("api/update-sheet/<int:sheet_id>/", views.update_sheet, name="update_sheet"),
    path("api/sheet/<int:sheet_id>/", views.sheet_detail_api, name="sheet_detail_api"),
    path("api/list-sheets/", views.list_sheets, name="list_sheets"),   # ✅ new
    path("api/add-course/", views.add_course, name="add_course"),
    path("api/course/<int:course_id>/", views.course_detail, name="course_detail"),
    path("api/update-course/<int:course_id>/", views.update_course, name="update_course"),
    path("api/sheet/<int:sheet_id>/pdf/", views.export_pdf, name="export_pdf"),
]

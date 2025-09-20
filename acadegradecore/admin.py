from django.contrib import admin
from .models import ContactMessage
from .models import UserProfile, ResultSheet, Year, Semester, Course

# Register your models here.
@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "created_at")
    search_fields = ("name", "email", "message")
    list_filter = ("created_at",)



admin.site.register(UserProfile)
admin.site.register(ResultSheet)
admin.site.register(Year)
admin.site.register(Semester)
admin.site.register(Course)

from django.db import models

class ContactMessage(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField()
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.email}"


class UserProfile(models.Model):
    uid = models.CharField(max_length=128, unique=True)   # Firebase UID
    name = models.CharField(max_length=150, blank=True, null=True)
    email = models.EmailField(unique=True)
    university = models.CharField(max_length=150, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name or self.email


class ResultSheet(models.Model):
    owner = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="sheets")
    student_name = models.CharField(max_length=200)
    university = models.CharField(max_length=200, blank=True)
    faculty = models.CharField(max_length=200, blank=True)
    department = models.CharField(max_length=200, blank=True)
    years_of_study = models.PositiveSmallIntegerField(default=4)
    semesters_per_year = models.PositiveSmallIntegerField(default=2)
    entry_year = models.CharField(max_length=20, help_text="e.g. 2021/2022")
    mode = models.CharField(
        max_length=32,
        choices=(('zeros','All zeros (Build up)'), ('available','Based on availability')),
        default='zeros'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student_name} ({self.university})"

    def total_semesters(self):
        return self.years_of_study * self.semesters_per_year

    @property
    def cgpa(self):
        total_points = 0
        total_credits = 0
        for year in self.years.all():
            for sem in year.semesters.all():
                for c in sem.courses.all():
                    total_points += c.credit_unit * c.grade_point
                    total_credits += c.credit_unit
        return round(total_points / total_credits, 2) if total_credits else 0


class Year(models.Model):
    sheet = models.ForeignKey(ResultSheet, on_delete=models.CASCADE, related_name="years")
    index = models.PositiveSmallIntegerField()
    year_label = models.CharField(max_length=40)  # e.g. "2021/2022 Year 1"
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('sheet', 'index')
        ordering = ['index']

    def __str__(self):
        return f"{self.sheet.student_name} - {self.year_label}"

    @property
    def year_gpa(self):
        total_points = 0
        total_credits = 0
        for sem in self.semesters.all():
            for c in sem.courses.all():
                total_points += c.credit_unit * c.grade_point
                total_credits += c.credit_unit
        return round(total_points / total_credits, 2) if total_credits else 0


class Semester(models.Model):
    year = models.ForeignKey(Year, on_delete=models.CASCADE, related_name="semesters")
    index = models.PositiveSmallIntegerField()
    label = models.CharField(max_length=80)    # e.g. "1st Semester"
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('year', 'index')
        ordering = ['index']

    def __str__(self):
        return f"{self.year} - {self.label}"

    @property
    def gpa(self):
        courses = self.courses.all()
        total_points = sum(c.credit_unit * c.grade_point for c in courses)
        total_credits = sum(c.credit_unit for c in courses)
        return round(total_points / total_credits, 2) if total_credits else 0


class Course(models.Model):
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name="courses")
    code = models.CharField(max_length=50, blank=True)
    title = models.CharField(max_length=200, blank=True)
    credit_unit = models.PositiveSmallIntegerField(default=0)
    incourse = models.PositiveSmallIntegerField(default=0)
    exam = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.code} - {self.title}"

    @property
    def score(self):
        return self.incourse + self.exam

    @property
    def grade(self):
        s = self.score
        if s >= 70: return "A"
        if s >= 60: return "B"
        if s >= 50: return "C"
        if s >= 45: return "D"
        if s >= 40: return "E"
        return "F"

    @property
    def grade_point(self):
        s = self.score
        if s >= 70: return 5
        if s >= 60: return 4
        if s >= 50: return 3
        if s >= 45: return 2
        if s >= 40: return 1
        return 0

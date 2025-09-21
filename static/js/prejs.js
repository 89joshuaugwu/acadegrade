// Call this after successful Firebase login (email/password or Google)
function syncFirebaseLoginWithDjango() {
  if (window.firebase && firebase.auth().currentUser) {
    firebase.auth().currentUser.getIdToken(true).then(function(idToken) {
      fetch('/firebase_login_sync/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'idToken=' + encodeURIComponent(idToken)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          window.location.href = '/dashboard/';
          showToast("✅ Synced user with backend, proceed to Dashboard", "success");
        } else {
          showToast('Login sync failed: ' + (data.error || 'danger'));
        }
      });
    });
  }
}


// Helper to get CSRF token if needed
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

document.addEventListener("DOMContentLoaded", () => {
  // ===== Enhanced Counter Animation with Intersection Observer =====
  const counters = document.querySelectorAll(".counter")
  const speed = 200

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const addCourseBtn = document.getElementById("add-course");
        const courseList = document.getElementById("course-list");
        const calcBtn = document.getElementById("calculate-cgpa");
        const resultBox = document.getElementById("cgpa-result");
        let courseCount = 0;

        function createCourseRow() {
          courseCount++;
          const row = document.createElement("div");
          row.classList.add("course-row", "fade-in");
          row.innerHTML = `
            <div class="row g-3 align-items-center">
              <div class="col-md-4">
                <label class="form-label small text-muted">Course Code</label>
                <input type="text" class="form-control" placeholder="e.g., MTH101" maxlength="10">
              </div>
              <div class="col-md-3">
                <label class="form-label small text-muted">Credit Unit</label>
                <input type="number" class="form-control credit" placeholder="2" min="1" max="6">
              </div>
              <div class="col-md-3">
                <label class="form-label small text-muted">Score (0-100)</label>
                <input type="number" class="form-control score" placeholder="85" min="0" max="100">
              </div>
              <div class="col-md-2">
                <label class="form-label small text-muted">&nbsp;</label>
                <button type="button" class="btn btn-outline-danger btn-sm w-100 remove-course">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          `;

          const removeBtn = row.querySelector(".remove-course");
          removeBtn.addEventListener("click", () => {
            row.style.animation = "fadeOut 0.3s ease-out";
            setTimeout(() => {
              row.remove();
              updateCalculateButton();
            }, 300);
          });

          const scoreInput = row.querySelector(".score");
          scoreInput.addEventListener("input", function () {
            const score = Number.parseFloat(this.value);
            let grade = "";
            let gradePoint = 0;

            if (score >= 70) {
              grade = "A";
              gradePoint = 5;
            } else if (score >= 60) {
              grade = "B";
              gradePoint = 4;
            } else if (score >= 50) {
              grade = "C";
              gradePoint = 3;
            } else if (score >= 45) {
              grade = "D";
              gradePoint = 2;
            } else if (score >= 40) {
              grade = "E";
              gradePoint = 1;
            } else {
              grade = "F";
              gradePoint = 0;
            }

            // Show grade preview
            let gradeDisplay = row.querySelector(".grade-display");
            if (!gradeDisplay) {
              gradeDisplay = document.createElement("small");
              gradeDisplay.className = "grade-display text-muted mt-1 d-block";
              scoreInput.parentNode.appendChild(gradeDisplay);
            }

            if (!isNaN(score) && score >= 0 && score <= 100) {
              gradeDisplay.textContent = `Grade: ${grade} (${gradePoint} points)`;
              gradeDisplay.style.color =
                gradePoint >= 3 ? "var(--success)" : gradePoint >= 1 ? "var(--warning)" : "var(--error)";
            } else {
              gradeDisplay.textContent = "";
            }
          });

          courseList.appendChild(row);
          updateCalculateButton();

          // Focus on the first input for better UX
          setTimeout(() => {
            row.querySelector("input").focus();
          }, 100);
        }

        function updateCalculateButton() {
          const courseRows = courseList.querySelectorAll(".course-row");
          if (courseRows.length === 0) {
            calcBtn.disabled = true;
            calcBtn.innerHTML = '<i class="bi bi-calculator me-2"></i>Add courses to calculate';
          } else {
            calcBtn.disabled = false;
            calcBtn.innerHTML = '<i class="bi bi-calculator me-2"></i>Calculate CGPA';
          }
        }

        if (addCourseBtn) {
          addCourseBtn.addEventListener("click", createCourseRow);
        }

        if (calcBtn) {
          calcBtn.addEventListener("click", () => {
            let totalPoints = 0;
            let totalCredits = 0;
            let validCourses = 0;
            const courseDetails = [];

            const credits = document.querySelectorAll(".credit");
            const scores = document.querySelectorAll(".score");

            credits.forEach((creditInput, index) => {
              const credit = Number.parseFloat(creditInput.value);
              const score = Number.parseFloat(scores[index].value);

              if (!isNaN(credit) && !isNaN(score) && credit > 0 && score >= 0 && score <= 100) {
                let gradePoint = 0
                let grade = ""

                if (score >= 70) {
                  gradePoint = 5
                  grade = "A"
                } else if (score >= 60) {
                  gradePoint = 4
                  grade = "B"
                } else if (score >= 50) {
                  gradePoint = 3
                  grade = "C"
                } else if (score >= 45) {
                  gradePoint = 2
                  grade = "D"
                } else if (score >= 40) {
                  gradePoint = 1
                  grade = "E"
                } else {
                  gradePoint = 0
                  grade = "F"
                }

                const points = gradePoint * credit
                totalPoints += points
                totalCredits += credit
                validCourses++

                courseDetails.push({
                  credit: credit,
                  score: score,
                  grade: grade,
                  gradePoint: gradePoint,
                  points: points,
                })
              }
            })

            if (validCourses > 0) {
              const cgpa = (totalPoints / totalCredits).toFixed(2)

              let cgpaClass = ""
              let cgpaMessage = ""

              if (cgpa >= 4.5) {
                cgpaClass = "success"
                cgpaMessage = "Excellent! First Class Honours"
              } else if (cgpa >= 3.5) {
                cgpaClass = "info"
                cgpaMessage = "Great! Second Class Upper"
              } else if (cgpa >= 2.5) {
                cgpaClass = "warning"
                cgpaMessage = "Good! Second Class Lower"
              } else if (cgpa >= 1.5) {
                cgpaClass = "warning"
                cgpaMessage = "Third Class Honours"
              } else {
                cgpaClass = "danger"
                cgpaMessage = "Pass"
              }

              resultBox.innerHTML = `
                <div class="card border-0 shadow-sm">
                  <div class="card-body text-center">
                    <div class="alert alert-${cgpaClass} mb-3">
                      <h4 class="mb-2"><i class="bi bi-trophy-fill me-2"></i>Your CGPA: <strong>${cgpa}</strong></h4>
                      <p class="mb-0">${cgpaMessage}</p>
                    </div>
                    <div class="row text-center">
                      <div class="col-4">
                        <div class="h5 text-primary">${validCourses}</div>
                        <small class="text-muted">Courses</small>
                      </div>
                      <div class="col-4">
                        <div class="h5 text-primary">${totalCredits}</div>
                        <small class="text-muted">Total Credits</small>
                      </div>
                      <div class="col-4">
                        <div class="h5 text-primary">${totalPoints.toFixed(1)}</div>
                        <small class="text-muted">Total Points</small>
                      </div>
                    </div>
                  </div>
                </div>
              `

              showToast(`🎉 Your CGPA is ${cgpa} - ${cgpaMessage}`, "success")

              // Add celebration animation for high CGPA
              if (cgpa >= 4.0) {
                resultBox.classList.add("slide-up")
                setTimeout(() => resultBox.classList.remove("slide-up"), 600)
              }
            } else {
              resultBox.innerHTML = `
                <div class="alert alert-danger">
                  <i class="bi bi-exclamation-triangle-fill me-2"></i>
                  Please add valid course details with proper credit units and scores (0-100).
                </div>
              `
              showToast("Please check your course details", "error")
            }
          })

          function showToast(message, type = "success") {
            const toastEl = document.getElementById("resultToast")
            const toastMsg = document.getElementById("toastMessage")

            // Update toast styling based on type
            toastEl.className = `toast align-items-center border-0 toast-${type}`
            toastMsg.textContent = message

            const toast = window.bootstrap.Toast(toastEl, {
              autohide: true,
              delay: 5000,
            })
            toast.show()
          }

          // ===== Enhanced Smooth Scroll with Active Link Highlighting =====
          const navLinks = document.querySelectorAll('a[href^="#"]')

          navLinks.forEach((anchor) => {
            anchor.addEventListener("click", function (e) {
              e.preventDefault()
              const targetId = this.getAttribute("href")
              const target = document.querySelector(targetId)

              if (target) {
                const navbarHeight = document.querySelector(".navbar").offsetHeight
                const targetPosition = target.offsetTop - navbarHeight - 20

                window.scrollTo({
                  top: targetPosition,
                  behavior: "smooth",
                })

                navLinks.forEach((link) => link.classList.remove("active"))
                this.classList.add("active")
              }
            })
          })

          window.addEventListener("scroll", () => {
            const sections = document.querySelectorAll("section[id]")
            const navbarHeight = document.querySelector(".navbar").offsetHeight

            sections.forEach((section) => {
              const sectionTop = section.offsetTop - navbarHeight - 50
              const sectionHeight = section.offsetHeight
              const scrollPosition = window.scrollY

              if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                const correspondingLink = document.querySelector(`a[href="#${section.id}"]`)
                if (correspondingLink) {
                  navLinks.forEach((link) => link.classList.remove("active"))
                  correspondingLink.classList.add("active")
                }
              }
            })
          })

          document.addEventListener("keydown", (e) => {
            // Ctrl/Cmd + Enter to calculate CGPA
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault()
              if (!calcBtn.disabled) {
                calcBtn.click()
              }
            }

            // Ctrl/Cmd + Plus to add course
            if ((e.ctrlKey || e.metaKey) && e.key === "+") {
              e.preventDefault()
              addCourseBtn.click()
            }
          })

          createCourseRow()

          const forms = document.querySelectorAll("form")
          forms.forEach((form) => {
            form.addEventListener("submit", (e) => {
              const submitBtn = form.querySelector('button[type="submit"]')
              if (submitBtn) {
                const originalText = submitBtn.innerHTML
                submitBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Processing...'
                submitBtn.disabled = true

                // Re-enable after 3 seconds (in case of errors)
                setTimeout(() => {
                  submitBtn.innerHTML = originalText
                  submitBtn.disabled = false
                }, 3000)
              }
            })
          })

          const inputs = document.querySelectorAll(".form-control")
          inputs.forEach((input) => {
            input.addEventListener("focus", function () {
              this.parentNode.classList.add("focused")
            })

            input.addEventListener("blur", function () {
              this.parentNode.classList.remove("focused")
              if (this.value) {
                this.parentNode.classList.add("filled")
              } else {
                this.parentNode.classList.remove("filled")
              }
            })
          })
        }
      })
    })
  })

const style = document.createElement("style")
style.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-10px); }
  }
  
  .focused .form-control {
    border-color: var(--primary-color) !important;
    box-shadow: 0 0 0 0.2rem rgba(8, 145, 178, 0.25) !important;
  }
  
  .filled .form-label {
    color: var(--primary-color) !important;
  }
`
document.head.appendChild(style);

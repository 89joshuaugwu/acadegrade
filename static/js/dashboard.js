document.addEventListener('DOMContentLoaded', () => {
  // Wait for UID to be set before loading sheets
  function waitForUidAndLoadSheets(retries = 20) {
    if (window.currentUserUid) {
      loadSheets();
    } else if (retries > 0) {
      setTimeout(() => waitForUidAndLoadSheets(retries - 1), 100);
    } else {
      showToast("User not authenticated. Please log in.", "danger");
    }
  }
  waitForUidAndLoadSheets();

  // console.log("Current UID:", window.currentUserUid);
  const createBtn = document.getElementById('createSheetBtn');
  const fabBtn = document.getElementById('fabCreateSheetBtn');
  const createModal = new bootstrap.Modal(document.getElementById('createSheetModal'));
  const createForm = document.getElementById('createSheetForm');

  // ----------------- LOADING STATE HELPERS -----------------
  function setButtonLoading(buttonId, loading = true) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    const loadingSpan = button.querySelector('.btn-loading');
    const textSpan = button.querySelector('.btn-text');
    
    if (loading) {
      loadingSpan?.classList.remove('d-none');
      textSpan?.classList.add('d-none');
      button.disabled = true;
    } else {
      loadingSpan?.classList.add('d-none');
      textSpan?.classList.remove('d-none');
      button.disabled = false;
    }
  }

  function showLoadingSkeleton() {
    document.getElementById("sheetsList").innerHTML = `
      <div class="col-12">
        <div class="card border-0 rounded-4 shadow-sm p-4">
          <div class="d-flex align-items-center">
            <div class="loading-skeleton rounded-circle me-3" style="width: 48px; height: 48px;"></div>
            <div class="flex-grow-1">
              <div class="loading-skeleton mb-2" style="width: 60%; height: 20px;"></div>
              <div class="loading-skeleton" style="width: 40%; height: 16px;"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="card border-0 rounded-4 shadow-sm p-4">
          <div class="d-flex align-items-center">
            <div class="loading-skeleton rounded-circle me-3" style="width: 48px; height: 48px;"></div>
            <div class="flex-grow-1">
              <div class="loading-skeleton mb-2" style="width: 70%; height: 20px;"></div>
              <div class="loading-skeleton" style="width: 50%; height: 16px;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------- CREATE SHEET -----------------
  [createBtn, fabBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', () => createModal.show());
  });

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.currentUserUid) return showToast('You must be signed in first.', 'warning');

    setButtonLoading('createSheetSubmitBtn', true);

    const formData = new FormData(createForm);
    const payload = Object.fromEntries(formData.entries());
    payload.uid = window.currentUserUid;

    try {
      const res = await fetch('/api/create-sheet/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.status === 'ok') {
        createModal.hide();
        showToast('Sheet created successfully!', 'success');
        createForm.reset();
        loadSheets();
      } else {
        showToast('Error: ' + (data.error || 'unknown'), 'danger');
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'danger');
    } finally {
      setButtonLoading('createSheetSubmitBtn', false);
    }
  });

  // ----------------- LOAD SHEETS -----------------
  async function loadSheets() {
    if (!window.currentUserUid) {
      document.getElementById("sheetsList").innerHTML = `
        <div class="col-12">
          <div class="card border-0 rounded-4 shadow-sm text-center p-4 p-md-5">
            <i class="bi bi-person-x" style="font-size: 3rem; color: var(--medium-gray);"></i>
            <h5 class="mt-3 text-muted">Sign in to see your sheets</h5>
            <p class="text-muted">Please sign in to access your result sheets and CGPA calculations.</p>
          </div>
        </div>
      `;
      return;
    }

    showLoadingSkeleton();

    try {
      const res = await fetch(`/api/list-sheets/?uid=${window.currentUserUid}`);
      const data = await res.json();

      const container = document.getElementById("sheetsList");
      container.innerHTML = "";

      if (!data.sheets || data.sheets.length === 0) {
        container.innerHTML = `
          <div class="col-12">
            <div class="card border-0 rounded-4 shadow-sm text-center p-4 p-md-5">
              <i class="bi bi-journal-plus" style="font-size: 3rem; color: var(--primary-color);"></i>
              <h5 class="mt-3">No result sheets yet</h5>
              <p class="text-muted mb-4">Get started by creating your first result sheet to track your academic progress.</p>
              <button class="btn btn-primary" onclick="document.getElementById('createSheetBtn').click()">
                <i class="bi bi-plus-circle me-1"></i> Create Your First Sheet
              </button>
            </div>
          </div>
        `;
        return;
      }

      const totalSheets = data.sheets.length;
      const avgCgpa = data.sheets.reduce((sum, sheet) => sum + sheet.cgpa, 0) / totalSheets;
      const bestCgpa = Math.max(...data.sheets.map(sheet => sheet.cgpa));

      // Animate stats update
      animateValue('statTotalSheets', 0, totalSheets, 1000);
      animateValue('statAvgCgpa', 0, avgCgpa, 1000, 2);
      animateValue('statBestCgpa', 0, bestCgpa, 1000, 2);

      // Update circular progress indicators
      setTimeout(() => {
        updateCgpaCircle('avgCgpaCircle', 'avgCgpaProgress', avgCgpa);
        updateCgpaCircle('bestCgpaCircle', 'bestCgpaProgress', bestCgpa);
        updateCgpaIndicator('avgCgpaIndicator', 'avgCgpaStatus', avgCgpa);
        updateCgpaIndicator('bestCgpaIndicator', 'bestCgpaStatus', bestCgpa);
      }, 500);

      data.sheets.forEach((sheet, index) => {
        const card = document.createElement("div");
        card.className = "col-12 col-md-6 col-lg-4";
        const cgpaPercent = Math.min((sheet.cgpa / 5) * 100, 100);
        const cgpaClass = getCgpaClass(sheet.cgpa);
        
        card.innerHTML = `
          <div class="card h-100 border-0 rounded-4 shadow-sm hover-lift" data-aos="fade-up" data-aos-delay="${index * 100}">
            <div class="card-body p-3 p-md-4">
              <div class="d-flex justify-content-between align-items-start mb-3">
                <div class="flex-grow-1 me-2">
                  <h5 class="fw-bold mb-1">
                    <i class="bi bi-person-badge me-2 text-primary"></i>
                    <span class="d-inline d-md-none">${sheet.student_name.split(' ')[0]}</span>
                    <span class="d-none d-md-inline">${sheet.student_name}</span>
                  </h5>
                  <p class="text-muted small mb-0">${sheet.university || "University not specified"}</p>
                  <div class="d-flex flex-wrap gap-1 mt-2">
                    <span class="badge bg-light text-dark border">
                      <i class="bi bi-building me-1"></i>
                      ${sheet.faculty || "Faculty not specified"}
                    </span>
                    <span class="badge bg-light text-dark border">
                      <i class="bi bi-diagram-3 me-1"></i>
                      ${sheet.department || "Department not specified"}
                    </span>
                  </div>
                </div>
                <span class="badge ${sheet.mode === "zeros" ? "bg-info" : "bg-success"} rounded-pill">
                  <span class="d-none d-sm-inline">${sheet.mode === "zeros" ? "Build-up" : "Available"}</span>
                  <span class="d-sm-none">${sheet.mode === "zeros" ? "Build" : "Avail"}</span>
                </span>
              </div>

              <div class="mb-3">
                <div class="d-flex flex-wrap gap-1">
                  <span class="badge bg-light text-dark border">
                    <i class="bi bi-calendar3 me-1"></i>
                    <span class="d-none d-sm-inline">${sheet.years_of_study} years</span>
                    <span class="d-sm-none">${sheet.years_of_study}y</span>
                  </span>
                  <span class="badge bg-light text-dark border">
                    <i class="bi bi-book me-1"></i>
                    <span class="d-none d-sm-inline">${sheet.semesters_per_year} sem/yr</span>
                    <span class="d-sm-none">${sheet.semesters_per_year}s/y</span>
                  </span>
                  <span class="badge bg-light text-dark border">
                    <i class="bi bi-mortarboard me-1"></i>${sheet.entry_year}
                  </span>
                </div>
              </div>

              <div class="mb-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="fw-semibold">CGPA</span>
                  <div class="d-flex align-items-center gap-2">
                    <span class="fw-bold fs-5 ${sheet.cgpa >= 4.5 ? "text-success" : sheet.cgpa >= 3.5 ? "text-primary" : sheet.cgpa >= 2.5 ? "text-warning" : "text-danger"}">
                      ${sheet.cgpa.toFixed(2)}
                    </span>
                    <span class="cgpa-indicator ${cgpaClass} d-none d-sm-inline-flex" style="font-size: 0.75rem; padding: 0.125rem 0.5rem;">
                      ${getCgpaStatus(sheet.cgpa)}
                    </span>
                  </div>
                </div>
                <div class="progress-enhanced">
                  <div class="progress-bar ${sheet.cgpa >= 4.5 ? "bg-success" : sheet.cgpa >= 3.5 ? "bg-primary" : sheet.cgpa >= 2.5 ? "bg-warning" : "bg-danger"}"
                       role="progressbar" style="width: ${cgpaPercent}%" aria-valuenow="${sheet.cgpa}" aria-valuemin="0" aria-valuemax="5"></div>
                </div>
                <div class="d-flex justify-content-between mt-1">
                  <small class="text-muted">0.0</small>
                  <small class="text-muted">5.0</small>
                </div>
              </div>

              <div class="d-flex gap-1 gap-md-2">
                <button class="btn btn-outline-primary btn-sm flex-fill viewSheetBtn" data-id="${sheet.id}">
                  <i class="bi bi-eye me-1"></i> 
                  <span class="d-none d-sm-inline">View</span>
                </button>
                <button class="btn btn-outline-secondary btn-sm editSheetBtn" data-id="${sheet.id}" title="Edit Sheet">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-outline-danger btn-sm deleteSheetBtn" data-id="${sheet.id}" title="Delete Sheet">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        `;
        container.appendChild(card);
      });

      // DELETE
      document.querySelectorAll(".deleteSheetBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Are you sure you want to delete this sheet?")) return;
          
          const originalContent = btn.innerHTML;
          btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
          btn.disabled = true;
          
          try {
            const id = btn.dataset.id;
            const res = await fetch(`/api/delete-sheet/${id}/?uid=${window.currentUserUid}`, { method: "DELETE" });
            const data = await res.json();
            
            if (data.status === "ok") {
              showToast("Sheet deleted successfully!", "success");
              loadSheets();
            } else {
              showToast("Error deleting: " + data.error, "danger");
            }
          } catch (error) {
            showToast("Network error. Please try again.", "danger");
          } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
          }
        });
      });

      // VIEW
      document.querySelectorAll(".viewSheetBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const originalContent = btn.innerHTML;
          btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Loading...';
          btn.disabled = true;
          
          try {
            const id = btn.dataset.id;
            const res = await fetch(`/api/sheet/${id}/`);
            const data = await res.json();
            renderSheetDetail(data);
          } catch (error) {
            showToast("Error loading sheet details.", "danger");
          } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
          }
        });
      });

    } catch (error) {
      document.getElementById("sheetsList").innerHTML = `
        <div class="col-12">
          <div class="card border-0 rounded-4 shadow-sm text-center p-4 p-md-5">
            <i class="bi bi-exclamation-triangle" style="font-size: 3rem; color: var(--warning);"></i>
            <h5 class="mt-3 text-muted">Error loading sheets</h5>
            <p class="text-muted mb-4">Please check your connection and try again.</p>
            <button class="btn btn-primary" onclick="loadSheets()">
              <i class="bi bi-arrow-clockwise me-1"></i> Retry
            </button>
          </div>
        </div>
      `;
    }
  }

  // ----------------- ANIMATION HELPERS -----------------
  function animateValue(elementId, start, end, duration, decimals = 0) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        current = end;
        clearInterval(timer);
      }
      element.textContent = decimals > 0 ? current.toFixed(decimals) : Math.floor(current);
    }, 16);
  }

  // ----------------- RENDER SHEET DETAIL -----------------
  function attachServerPdfHandler(sheetId) {
    const btn = document.getElementById("serverPdfBtn");
    btn.href = `/api/sheet/${sheetId}/pdf/`;
  }

  function renderSheetDetail(sheet) {
    const container = document.getElementById("sheetsList");
    
    container.innerHTML = `
      <div class="col-12">
        <div class="card border-0 rounded-4 shadow-lg mb-4" data-aos="zoom-in">
          <div class="card-body p-3 p-md-4">
            <div class="d-flex flex-column flex-md-row justify-content-between align-items-start mb-3">
              <div class="mb-3 mb-md-0">
                <h4 class="fw-bold mb-1">
                  <i class="bi bi-person-badge me-2 text-primary"></i>
                  ${sheet.student_name}
                </h4>
                <p class="text-muted mb-2">
                  <i class="bi bi-building me-2"></i>
                  ${sheet.university || "University not specified"}
                </p>
              </div>
              <div class="text-start text-md-end">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span class="text-muted">Overall CGPA:</span>
                  <span class="badge fs-6 px-3 py-2 ${sheet.cgpa >= 4.5 ? "bg-success" : sheet.cgpa >= 3.5 ? "bg-primary" : sheet.cgpa >= 2.5 ? "bg-warning" : "bg-danger"}">
                    ${sheet.cgpa.toFixed(2)}
                  </span>
                </div>
                <button class="btn btn-outline-secondary btn-sm" onclick="window.location.href='/dashboard/'">
                  <i class="bi bi-arrow-left me-1"></i> Back to List
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    sheet.years.forEach((y, index) => {
      const yearCard = document.createElement("div");
      yearCard.className = "col-12 mb-3";
      yearCard.innerHTML = `
        <div class="card border-0 rounded-4 shadow-sm" data-aos="fade-up" data-aos-delay="${index * 100}">
          <div class="card-header bg-transparent border-0 p-3 p-md-4">
            <div class="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
              <h5 class="fw-bold mb-0">
                <i class="bi bi-calendar-check me-2 text-primary"></i>
                ${y.year_label}
              </h5>
              <span class="badge fs-6 px-3 py-2 ${y.year_gpa >= 4.5 ? "bg-success" : y.year_gpa >= 3.5 ? "bg-primary" : y.year_gpa >= 2.5 ? "bg-warning" : "bg-danger"}">
                GPA: ${y.year_gpa.toFixed(2)}
              </span>
            </div>
          </div>
          <div class="card-body p-3 p-md-4 pt-0">
            <div class="row g-3">
              ${y.semesters.map((s, semIndex) => `
                <div class="col-12 col-lg-6">
                  <div class="card h-100 border rounded-3 shadow-sm" data-aos="fade-up" data-aos-delay="${(index * 200) + (semIndex * 100)}">
                    <div class="card-body p-3">
                      <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="fw-bold mb-0 text-primary">
                          <i class="bi bi-book-half me-2"></i>
                          ${s.label}
                        </h6>
                        <span class="badge ${s.gpa >= 4.5 ? "bg-success" : s.gpa >= 3.5 ? "bg-primary" : s.gpa >= 2.5 ? "bg-warning" : s.gpa >= 1.5 ? "bg-secondary" : "bg-danger"}">
                          ${s.gpa.toFixed(2)}
                        </span>
                      </div>
                      
                      <div class="progress mb-3" style="height: 6px;">
                        <div class="progress-bar ${s.gpa >= 4.5 ? "bg-success" : s.gpa >= 3.5 ? "bg-primary" : s.gpa >= 2.5 ? "bg-warning" : s.gpa >= 1.5 ? "bg-secondary" : "bg-danger"}"
                             role="progressbar" style="width: ${(s.gpa/5)*100}%" aria-valuenow="${s.gpa}" aria-valuemin="0" aria-valuemax="5"></div>
                      </div>

                      <div class="courses-list mb-3" style="max-height: 200px; overflow-y: auto;">
                        ${s.courses.map(c => `
                          <div class="d-flex justify-content-between align-items-start py-2 border-bottom">
                            <div class="flex-grow-1 me-2">
                              <div class="fw-semibold">${c.code}</div>
                              <div class="small text-muted">${c.title}</div>
                              <div class="small">
                                <span class="badge bg-light text-dark">${c.credit_unit}u</span>
                              </div>
                            </div>
                            <div class="text-end">
                              <span class="badge ${c.grade === "A" ? "bg-success" : c.grade === "B" ? "bg-primary" : c.grade === "C" ? "bg-info" : c.grade === "D" ? "bg-warning" : c.grade === "E" ? "bg-secondary" : "bg-danger"}">
                                ${c.grade}
                              </span>
                              <div class="small text-muted">${c.score}</div>
                              <button class="btn btn-sm btn-outline-secondary ms-1 editCourseBtn" data-id="${c.id}" title="Edit Course">
                                <i class="bi bi-pencil"></i>
                              </button>
                            </div>
                          </div>
                        `).join("")}
                      </div>

                      <button class="btn btn-sm btn-success w-100 addCourseBtn" data-id="${s.id}" data-label="${s.label}">
                        <i class="bi bi-plus-circle me-1"></i> Add Course
                      </button>
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;
      attachServerPdfHandler(sheet.id);
      container.appendChild(yearCard);
    });

    // ADD COURSE
    document.querySelectorAll(".addCourseBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.getElementById("courseSemesterId").value = btn.dataset.id;
        document.getElementById("semesterModalTitle").innerText = btn.dataset.label;
        new bootstrap.Modal(document.getElementById("semesterModal")).show();
      });
    });

    attachEditCourseHandlers();
  }

  // ----------------- EDIT COURSE -----------------
  function attachEditCourseHandlers() {
    document.querySelectorAll(".editCourseBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        btn.disabled = true;
        const payload = Object.fromEntries(new FormData(e.target).entries());
        payload.uid = window.currentUserUid;
        
        try {
          const id = btn.dataset.id;
          const res = await fetch(`/api/course/${id}/`);
          const data = await res.json();

          if (data.error) {
            showToast("Error: " + data.error, "danger");
            return;
          }

          document.getElementById("editCourseId").value = id;
          document.getElementById("editCode").value = data.code;
          document.getElementById("editTitle").value = data.title;
          document.getElementById("editCredit").value = data.credit_unit;
          document.getElementById("editIncourse").value = data.incourse;
          document.getElementById("editExam").value = data.exam;

          new bootstrap.Modal(document.getElementById("editCourseModal")).show();
        } catch (error) {
          showToast("Error loading course details.", "danger");
        } finally {
          btn.innerHTML = originalContent;
          btn.disabled = false;
        }
      });
    });
  }

  document.getElementById("editCourseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    setButtonLoading('editCourseSubmitBtn', true);
    
    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      const id = payload.course_id;
      delete payload.course_id;

      const res = await fetch(`/api/update-course/${id}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.status === "ok") {
        bootstrap.Modal.getInstance(document.getElementById("editCourseModal")).hide();
        showToast("Course updated successfully!", "success");
        loadSheets();
      } else {
        showToast("Error updating course: " + data.error, "danger");
      }
    } catch (error) {
      showToast("Network error. Please try again.", "danger");
    } finally {
      setButtonLoading('editCourseSubmitBtn', false);
    }
  });

  // ----------------- EDIT SHEET -----------------
  document.addEventListener("click", async (e) => {
    if (e.target.closest(".editSheetBtn")) {
      const btn = e.target.closest(".editSheetBtn");
      const originalContent = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
      btn.disabled = true;

      try {
        const id = btn.dataset.id;
        const res = await fetch(`/api/sheet/${id}/`);
        const sheet = await res.json();

        document.getElementById("editSheetId").value = sheet.id;
        document.getElementById("editStudentName").value = sheet.student_name;
        document.getElementById("editUniversity").value = sheet.university || "";
        document.getElementById("editFaculty").value = sheet.faculty || "";
        document.getElementById("editDepartment").value = sheet.department || "";
        document.getElementById("editEntryYear").value = sheet.entry_year || "";
        document.getElementById("editMode").value = sheet.mode;

        new bootstrap.Modal(document.getElementById("editSheetModal")).show();
      } catch (error) {
        showToast("Error loading sheet details.", "danger");
      } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
      }
    }
  });

  document.getElementById("editSheetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    setButtonLoading('editSheetSubmitBtn', true);
    
    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      const id = payload.sheet_id;
      delete payload.sheet_id;
      // Ensure UID is sent in update payload
      payload.uid = window.currentUserUid;

      const res = await fetch(`/api/update-sheet/${id}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.status === "ok") {
        bootstrap.Modal.getInstance(document.getElementById("editSheetModal")).hide();
        showToast("Sheet updated successfully!", "success");
        loadSheets();
      } else {
        showToast("Error updating sheet: " + data.error, "danger");
      }
    } catch (error) {
      showToast("Network error. Please try again.", "danger");
    } finally {
      setButtonLoading('editSheetSubmitBtn', false);
    }
  });

  // ----------------- ADD COURSE -----------------
  document.getElementById('addCourseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setButtonLoading('addCourseSubmitBtn', true);
    
    try {
      const payload = Object.fromEntries(new FormData(e.target).entries());
      const res = await fetch('/api/add-course/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.status === 'ok') {
        showToast("Course added successfully!", "success");
        e.target.reset();
        loadSheets();
      } else {
        showToast("Error adding course: " + data.error, "danger");
      }
    } catch (error) {
      showToast("Network error. Please try again.", "danger");
    } finally {
      setButtonLoading('addCourseSubmitBtn', false);
    }
  });

  // ----------------- EXPORT & PRINT -----------------
  document.getElementById("printBtn").addEventListener("click", () => window.print());

  document.getElementById("pdfBtn").addEventListener("click", async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "pt", "a4");
    const element = document.getElementById("sheetsList");
    await doc.html(element, {
      callback: pdf => pdf.save("result_sheet.pdf"),
      margin: [20, 20, 20, 20],
      autoPaging: "text",
      x: 10, y: 10, width: 500, windowWidth: 1000
    });
  });

 
});

// ----------------- TOAST HELPER -----------------
function showToast(message, type = "primary") {
  const toastEl = document.getElementById("liveToast");
  const toastBody = document.getElementById("toastMessage");
  toastBody.textContent = message;
  toastEl.className = `toast align-items-center text-bg-${type} border-0`;
  new bootstrap.Toast(toastEl).show();
}

function updateCgpaCircle(circleId, progressId, value, maxValue = 5) {
  const circle = document.getElementById(circleId);
  const progress = document.getElementById(progressId);
  
  if (!circle || !progress) return;
  
  const percentage = (value / maxValue) * 100;
  const circumference = 2 * Math.PI * 42; // radius = 42
  const strokeDasharray = (percentage / 100) * circumference;
  
  progress.style.strokeDasharray = `${strokeDasharray} ${circumference}`;
  
  // Apply color based on CGPA value
  const cgpaClass = getCgpaClass(value);
  circle.className = `cgpa-circle ${cgpaClass}`;
}

function getCgpaClass(cgpa) {
  if (cgpa >= 4.5) return 'cgpa-excellent';
  if (cgpa >= 3.5) return 'cgpa-good';
  if (cgpa >= 2.5) return 'cgpa-average';
  return 'cgpa-poor';
}

function getCgpaStatus(cgpa) {
  if (cgpa >= 4.5) return 'Excellent';
  if (cgpa >= 3.5) return 'Good';
  if (cgpa >= 2.5) return 'Average';
  return 'Needs Improvement';
}

function updateCgpaIndicator(indicatorId, statusId, cgpa) {
  const indicator = document.getElementById(indicatorId);
  const status = document.getElementById(statusId);
  
  if (!indicator || !status) return;
  
  const cgpaClass = getCgpaClass(cgpa);
  const cgpaStatus = getCgpaStatus(cgpa);
  
  indicator.className = `cgpa-indicator ${cgpaClass}`;
  indicator.style.display = 'inline-flex';
  status.textContent = cgpaStatus;
}
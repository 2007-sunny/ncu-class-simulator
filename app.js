(function () {
    "use strict";

    const CONFIG = {
        defaultSemester: "1151",
        storageKey: "ncu_cart_v2",
        legacyStorageKey: "ncu_cart",
        // Metadata only. The real semester list is discovered from window.NCU_COURSES,
        // so adding a loaded course_XXXX.js file does not require touching render code.
        semesters: [
            { id: "1151", label: "115-1", file: "course_1151.js" },
            { id: "1142", label: "114-2", file: "course_1142.js" },
            { id: "1141", label: "114-1", file: "course_1141.js" }
        ],
        departments: {
            LN: "語言中心",
            GS: "通識",
            MA: "數學",
            PH: "物理",
            OS: "光電",
            ME: "機械",
            EE: "電機",
            CE: "資工",
            CC: "共同"
        },
        days: [
            { key: "一", label: "星期一", aliases: ["一", "Mon"] },
            { key: "二", label: "星期二", aliases: ["二", "Tue"] },
            { key: "三", label: "星期三", aliases: ["三", "Wed"] },
            { key: "四", label: "星期四", aliases: ["四", "Thu"] },
            { key: "五", label: "星期五", aliases: ["五", "Fri"] },
            { key: "六", label: "星期六", aliases: ["六", "Sat"] },
            { key: "日", label: "星期日", aliases: ["日", "Sun"] }
        ],
        periods: [
            { id: "1", time: "08:00" }, { id: "2", time: "09:00" }, { id: "3", time: "10:00" },
            { id: "4", time: "11:00" }, { id: "Z", time: "12:00" }, { id: "5", time: "13:00" },
            { id: "6", time: "14:00" }, { id: "7", time: "15:00" }, { id: "8", time: "16:00" },
            { id: "9", time: "17:00" }, { id: "A", time: "18:00" }, { id: "B", time: "19:00" },
            { id: "C", time: "20:00" }
        ],
        colors: ["#e57373", "#f06292", "#ba68c8", "#7986cb", "#64b5f6", "#4dd0e1", "#4db6ac", "#81c784", "#aed581", "#ffb74d"],
        graduation: {
            total: 128,
            common: 25,
            deptComp: 58,
            cross: 6,
            deptElective: { A: 15, B: 9 },
            deptCompCodes: ["PH1027", "PH1028", "PH1029", "PH1030", "PH2003", "PH2004", "PH3011", "PH3009", "PH2029", "PH2030", "MA1001", "MA1002"]
        }
    };

    const state = {
        currentSemester: CONFIG.defaultSemester,
        courses: [],
        currentData: [],
        sortCol: "sort_key",
        sortAsc: true,
        cart: [],
        cartView: "list"
    };

    const $ = (id) => document.getElementById(id);
    const configuredSemester = (id) => CONFIG.semesters.find((s) => s.id === id);
    const semesterLabel = (id) => (configuredSemester(id) || { label: `${id.slice(0, 3)}-${id.slice(3)}` }).label;
    const courseKey = (semester, id) => `${semester}::${id}`;
    const normalizeText = (value) => String(value || "").toLowerCase();

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[ch]));
    }

    function decorateCourse(course, semester) {
        return {
            ...course,
            semester,
            key: courseKey(semester, course.id)
        };
    }

    function availableSemesters() {
        const loadedIds = Object.keys(window.NCU_COURSES || {}).filter((id) => Array.isArray(window.NCU_COURSES[id]));
        return loadedIds
            .sort((a, b) => String(b).localeCompare(String(a)))
            .map((id) => configuredSemester(id) || { id, label: semesterLabel(id), file: `course_${id}.js` });
    }

    function renderSemesterOptions() {
        const available = availableSemesters();
        const main = $("semesterSelect");
        const cart = $("cartSemesterSelect");

        main.innerHTML = available.map((sem) => `<option value="${sem.id}">${sem.label}</option>`).join("");
        cart.innerHTML = [
            `<option value="all">顯示全部學期</option>`,
            ...available.map((sem) => `<option value="${sem.id}">僅顯示 ${sem.label}</option>`)
        ].join("");

        if (!available.some((sem) => sem.id === state.currentSemester)) {
            state.currentSemester = available[0]?.id || CONFIG.defaultSemester;
        }
        main.value = state.currentSemester;
        cart.value = state.currentSemester;
    }

    function loadCart() {
        const raw = localStorage.getItem(CONFIG.storageKey) || localStorage.getItem(CONFIG.legacyStorageKey);
        if (!raw) return [];

        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];

            return parsed.map((item) => {
                if (typeof item === "string") {
                    const course = findCourse(state.currentSemester, item);
                    return course ? decorateCourse(course, state.currentSemester) : null;
                }

                const semester = item.semester || item.sem || state.currentSemester;
                const id = item.id;
                const course = findCourse(semester, id);
                return course ? decorateCourse(course, semester) : (id ? decorateCourse(item, semester) : null);
            }).filter(Boolean);
        } catch (error) {
            console.warn("Cannot read saved cart", error);
            return [];
        }
    }

    function saveCart() {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.cart.map((course) => ({
            id: course.id,
            semester: course.semester
        }))));
        updateCartUI();
        renderSearchTable(state.currentData);
    }

    function findCourse(semester, id) {
        return (window.NCU_COURSES?.[semester] || []).find((course) => course.id === id);
    }

    function selectedCourseKeys() {
        return new Set(state.cart.map((course) => course.key || courseKey(course.semester, course.id)));
    }

    function setCurrentSemester(semester) {
        state.currentSemester = semester;
        state.courses = (window.NCU_COURSES?.[semester] || []).map((course) => decorateCourse(course, semester));
        state.currentData = [...state.courses];
        initSelectors();
        filter();
        const cartSemSelect = $("cartSemesterSelect");
        if (cartSemSelect && cartSemSelect.value !== "all") cartSemSelect.value = semester;
        updateCartUI();
    }

    function initSelectors() {
        const deptSelect = $("deptSelect");
        const daySelect = $("daySelect");
        const currentDept = deptSelect.value;
        const currentDay = daySelect.value;

        deptSelect.innerHTML = `<option value="">所有</option>`;
        daySelect.innerHTML = `<option value="">不限</option>`;

        [...new Set(state.courses.map((course) => course.id.slice(0, 2)))].sort().forEach((dept) => {
            const label = CONFIG.departments[dept] ? `${CONFIG.departments[dept]} (${dept})` : dept;
            deptSelect.add(new Option(label, dept));
        });

        CONFIG.days.forEach((day) => daySelect.add(new Option(day.label, day.key)));
        if ([...deptSelect.options].some((option) => option.value === currentDept)) deptSelect.value = currentDept;
        if ([...daySelect.options].some((option) => option.value === currentDay)) daySelect.value = currentDay;
    }

    function renderSearchTable(data) {
        const tbody = $("searchTableBody");
        const selected = selectedCourseKeys();

        tbody.innerHTML = data.length ? data.map((course) => {
            const isSelected = selected.has(course.key);
            const action = isSelected
                ? `<span class="added-tag">已加入</span>`
                : `<button class="action-btn add-btn" onclick="addToCart('${escapeHtml(course.id)}')">+ 加入</button>`;

            return `<tr>
                <td style="font-family: monospace; font-size:0.9em;"><b>${escapeHtml(course.id)}</b></td>
                <td>${escapeHtml(course.name)}</td>
                <td>${escapeHtml(course.teacher)}</td>
                <td style="color: var(--ncu-red); font-weight: bold; font-size:0.9em;">${course.time}<br><span style="color:#666;font-size:0.8em;font-weight:normal;">${course.location}</span></td>
                <td>${action}</td>
            </tr>`;
        }).join("") : `<tr><td colspan="5" class="no-data" style="text-align:center;">沒有符合條件的課程</td></tr>`;
    }

    function addToCart(id) {
        const course = state.courses.find((item) => item.id === id);
        if (!course) return;
        if (!selectedCourseKeys().has(course.key)) {
            state.cart.push({ ...course });
            saveCart();
        }
    }

    function removeFromCart(key) {
        state.cart = state.cart.filter((course) => (course.key || courseKey(course.semester, course.id)) !== key);
        saveCart();
    }

    function clearCart() {
        const showSemester = $("cartSemesterSelect").value;
        if (showSemester === "all") {
            if (confirm("確定清空所有學期的課表？")) {
                state.cart = [];
                saveCart();
            }
            return;
        }

        if (confirm(`確定清空 ${semesterLabel(showSemester)} 的課表？`)) {
            state.cart = state.cart.filter((course) => course.semester !== showSemester);
            saveCart();
        }
    }

    function filteredCart() {
        const showSemester = $("cartSemesterSelect").value;
        const courses = showSemester === "all"
            ? [...state.cart]
            : state.cart.filter((course) => course.semester === showSemester);

        return courses.sort((a, b) => {
            if (a.semester !== b.semester) return String(b.semester).localeCompare(String(a.semester));
            return (a.sort_key || 9999) - (b.sort_key || 9999);
        });
    }

    function hasConflict(course, scope) {
        return scope.some((other) => {
            if ((other.key || courseKey(other.semester, other.id)) === (course.key || courseKey(course.semester, course.id))) return false;
            if (other.semester !== course.semester) return false;
            return courseTimeSlots(course).some((slot) => courseTimeSlots(other).includes(slot));
        });
    }

    function courseTimeSlots(course) {
        const times = Array.isArray(course.raw_time) ? course.raw_time : [course.raw_time];
        return times.flatMap((raw) => {
            const parsed = parseRawTime(raw);
            if (!parsed) return [];
            return parsed.periods.map((period) => `${parsed.day}${period}`);
        });
    }

    function parseRawTime(raw) {
        if (!raw || raw === "未定") return null;
        const text = String(raw).trim();
        const day = CONFIG.days.find((item) => item.aliases.some((alias) => text.startsWith(alias)));
        if (!day) return null;
        const prefix = day.aliases.find((alias) => text.startsWith(alias));
        const rest = text.slice(prefix.length).replace(/\/.*$/, "");
        const periods = rest.match(/[0-9A-Z]/g) || [];
        if (!periods.length) return null;
        return { day: day.key, periods };
    }

    function renderCartList(displayCart, showSemester) {
        const tbody = $("cartTableBody");
        if (!displayCart.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="no-data" style="text-align:center;">課表目前是空的</td></tr>`;
            return;
        }

        const semesters = availableSemesters();
        const groups = showSemester === "all"
            ? semesters.map((sem) => ({ sem, courses: displayCart.filter((course) => course.semester === sem.id) })).filter((group) => group.courses.length)
            : [{ sem: semesters.find((sem) => sem.id === showSemester) || { id: showSemester, label: semesterLabel(showSemester) }, courses: displayCart }];

        tbody.innerHTML = groups.map((group) => {
            const rows = group.courses.map((course) => {
                const key = course.key || courseKey(course.semester, course.id);
                const conflict = hasConflict(course, state.cart);
                return `<tr class="${conflict ? "conflict-row" : ""}">
                    <td style="font-family: monospace; font-size:0.9em;"><span class="semester-pill">${group.sem.label}</span><b>${escapeHtml(course.id)}</b></td>
                    <td>${escapeHtml(course.name)}</td>
                    <td>${escapeHtml(course.credit)}</td>
                    <td style="font-weight: bold; font-size:0.9em;">${course.time}</td>
                    <td>${conflict ? `<span class="conflict-text">衝堂</span>` : `<span style="color: green;">OK</span>`}</td>
                    <td><button class="action-btn del-btn" onclick="removeFromCart('${key}')">移除</button></td>
                </tr>`;
            }).join("");

            if (showSemester !== "all") return rows;
            const credits = group.courses.reduce((sum, course) => sum + Number(course.credit || 0), 0);
            return `<tr class="semester-row"><td colspan="6">${group.sem.label} <span class="muted">${group.courses.length} 門，${credits} 學分</span></td></tr>${rows}`;
        }).join("");
    }

    function updateCartUI() {
        state.cart = state.cart.map((course) => decorateCourse(course, course.semester || state.currentSemester));
        const showSemester = $("cartSemesterSelect").value;
        const displayCart = filteredCart();

        $("cartCount").innerText = state.cart.length;
        $("totalCredits").innerText = displayCart.reduce((sum, course) => sum + Number(course.credit || 0), 0);

        renderCartList(displayCart, showSemester);
        renderGridTimetable(displayCart, showSemester);
        updateGraduationProgress();
    }

    function updateGraduationProgress() {
        const checkedStream = document.querySelector('input[name="stream"]:checked');
        const stream = checkedStream ? checkedStream.value : "A";
        const deptElectiveReq = CONFIG.graduation.deptElective[stream] || CONFIG.graduation.deptElective.A;
        $("label-dept-elec").innerText = `系內選修 (${deptElectiveReq})`;

        const credits = { total: 0, deptComp: 0, common: 0, deptElec: 0, cross: 0 };
        state.cart.forEach((course) => {
            const credit = Number(course.credit || 0);
            credits.total += credit;
            if (CONFIG.graduation.deptCompCodes.some((code) => course.id.includes(code))) credits.deptComp += credit;
            else if (course.id.startsWith("PH")) credits.deptElec += credit;
            else if (course.id.startsWith("GS") || course.id.startsWith("CC") || course.id.length > 8) credits.common += credit;
            else credits.cross += credit;
        });

        updateCard("total", credits.total, CONFIG.graduation.total);
        updateCard("dept-comp", credits.deptComp, CONFIG.graduation.deptComp);
        updateCard("common", credits.common, CONFIG.graduation.common);
        updateCard("dept-elec", credits.deptElec, deptElectiveReq);
        updateCard("cross", credits.cross, CONFIG.graduation.cross);
    }

    function updateCard(id, current, target) {
        const bar = $(`bar-${id}`);
        const text = $(`txt-${id}`);
        const status = $(`stat-${id}`);
        if (!bar || !text || !status) return;

        bar.style.width = `${Math.min((current / target) * 100, 100)}%`;
        text.innerText = `${current}/${target}`;
        status.innerHTML = current >= target
            ? `<span class="status-pass">達成</span>`
            : `<span class="status-fail">差 ${Math.max(target - current, 0)}</span>`;
    }

    function switchTab(tab) {
        $("tabSearch").classList.toggle("active", tab === "search");
        $("tabCart").classList.toggle("active", tab === "cart");
        $("searchSection").classList.toggle("hidden", tab !== "search");
        $("cartSection").classList.toggle("hidden", tab !== "cart");
        if (tab === "cart") updateCartUI();
    }

    function setCartView(view) {
        state.cartView = view;
        $("btnListView").classList.toggle("active", view === "list");
        $("btnGridView").classList.toggle("active", view === "grid");
        $("cartListView").classList.toggle("hidden", view !== "list");
        $("cartGridView").classList.toggle("hidden", view !== "grid");
    }

    function filter() {
        const dept = normalizeText($("deptSelect").value);
        const name = normalizeText($("nameInput").value);
        const day = $("daySelect").value;
        const loc = normalizeText($("locInput").value);

        state.currentData = state.courses.filter((course) => {
            const matchesDept = !dept || normalizeText(course.id).startsWith(dept);
            const matchesName = !name || normalizeText(course.name).includes(name);
            const matchesDay = !day || String(course.time || "").includes(day) || courseTimeSlots(course).some((slot) => slot.startsWith(day));
            const matchesLoc = !loc || normalizeText(course.location).includes(loc);
            return matchesDept && matchesName && matchesDay && matchesLoc;
        });
        applySort();
    }

    function clearSearch() {
        $("deptSelect").value = "";
        $("nameInput").value = "";
        $("daySelect").value = "";
        $("locInput").value = "";
        filter();
    }

    function sortBy(col) {
        if (state.sortCol === col) state.sortAsc = !state.sortAsc;
        else {
            state.sortCol = col;
            state.sortAsc = true;
        }
        applySort();
    }

    function applySort() {
        state.currentData.sort((a, b) => {
            const valA = a[state.sortCol] ?? "";
            const valB = b[state.sortCol] ?? "";
            if (valA < valB) return state.sortAsc ? -1 : 1;
            if (valA > valB) return state.sortAsc ? 1 : -1;
            return 0;
        });
        renderSearchTable(state.currentData);
    }

    function changeSemester() {
        setCurrentSemester($("semesterSelect").value);
    }

    function exportCart() {
        if (!state.cart.length) {
            alert("課表是空的！");
            return;
        }
        const payload = state.cart.map((course) => ({ id: course.id, semester: course.semester }));
        prompt("請複製代碼傳給朋友或在手機上匯入：", btoa(JSON.stringify(payload)));
    }

    function importCart() {
        const code = prompt("請貼上代碼：");
        if (!code) return;

        try {
            const cartData = JSON.parse(atob(code));
            const imported = cartData.map((data) => {
                const semester = typeof data === "string" ? state.currentSemester : (data.semester || data.sem || state.currentSemester);
                const id = typeof data === "string" ? data : data.id;
                const course = findCourse(semester, id);
                return course ? decorateCourse(course, semester) : null;
            }).filter(Boolean);

            state.cart = imported;
            saveCart();
            alert(`成功匯入 ${imported.length} 堂課！`);
        } catch (error) {
            alert("代碼格式錯誤！");
        }
    }

    function renderGridTimetable(displayCart, showSemester) {
        $("timetableSemesterTitle").innerText = showSemester === "all" ? "(全部學期，依課程標示)" : `(${semesterLabel(showSemester)})`;
        const tbody = $("timetableGridBody");
        tbody.innerHTML = "";

        const matrix = {};
        CONFIG.periods.forEach((period) => { matrix[period.id] = { 一: [], 二: [], 三: [], 四: [], 五: [] }; });

        displayCart.forEach((course, index) => {
            const color = CONFIG.colors[index % CONFIG.colors.length];
            const times = Array.isArray(course.raw_time) ? course.raw_time : [course.raw_time];
            times.forEach((raw) => {
                const parsed = parseRawTime(raw);
                if (!parsed || !matrix[parsed.periods[0]]) return;
                parsed.periods.forEach((period) => {
                    if (matrix[period]?.[parsed.day]) {
                        matrix[period][parsed.day].push({ course, color });
                    }
                });
            });
        });

        CONFIG.periods.forEach((period) => {
            let rowHtml = `<tr><td><b>${period.id}</b><br><span class="time-cell">${period.time}</span></td>`;
            ["一", "二", "三", "四", "五"].forEach((day) => {
                const cellHtml = matrix[period.id][day].map(({ course, color }) => {
                    const sem = showSemester === "all" ? `<small>${semesterLabel(course.semester)}</small><br>` : "";
                    return `<div class="course-block" style="background:${color};">${sem}${escapeHtml(course.name)}<br><small>${escapeHtml(course.location)}</small></div>`;
                }).join("");
                rowHtml += `<td>${cellHtml}</td>`;
            });
            tbody.insertAdjacentHTML("beforeend", `${rowHtml}</tr>`);
        });
    }

    function downloadTimetableImage() {
        if (state.cartView !== "grid") setCartView("grid");
        if (!window.html2canvas) {
            alert("圖片下載元件尚未載入，請確認網路連線後再試。");
            return;
        }

        setTimeout(() => {
            const captureArea = $("timetableCaptureArea");
            window.html2canvas(captureArea, { scale: 2, backgroundColor: "#ffffff" }).then((canvas) => {
                const link = document.createElement("a");
                link.download = `NCU_課表_${Date.now()}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            });
        }, 300);
    }

    function bindEvents() {
        ["deptSelect", "daySelect", "nameInput", "locInput"].forEach((id) => {
            const oldElement = $(id);
            const newElement = oldElement.cloneNode(true);
            oldElement.replaceWith(newElement);
            newElement.addEventListener("input", filter);
        });
    }

    function exposeGlobals() {
        Object.assign(window, {
            addToCart,
            removeFromCart,
            clearCart,
            updateCartUI,
            updateGraduationProgress,
            switchTab,
            setCartView,
            filter,
            clearSearch,
            sortBy,
            changeSemester,
            exportCart,
            importCart,
            downloadTimetableImage
        });
    }

    function init() {
        exposeGlobals();
        renderSemesterOptions();
        bindEvents();
        state.cart = loadCart();
        $("nameInput").value = "";
        $("locInput").value = "";
        $("deptSelect").value = "";
        $("daySelect").value = "";
        setCurrentSemester(state.currentSemester);
        switchTab("search");
    }

    window.addEventListener("DOMContentLoaded", init);
})();

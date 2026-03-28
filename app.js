const output = document.getElementById("output");
const headerTitle = document.getElementById("headerTitle");
const headerDescription = document.getElementById("headerDescription");
const selectedTemplateChip = document.getElementById("selectedTemplateChip");
const navButtons = document.getElementById("navButtons");
const simpleTemplateSelect = document.getElementById("simpleTemplateSelect");
const simplePostUrl = document.getElementById("simplePostUrl");
const simpleSend = document.getElementById("simpleSend");
const simpleStatus = document.getElementById("simpleStatus");
const userPreview = document.getElementById("userPreview");
const dashboardTokenInput = document.getElementById("dashboardToken");
const settingsStatus = document.getElementById("settingsStatus");

const views = {
  send: {
    id: "view-send",
    title: "Enviar publicación",
    description: "Pega el link, elige plantilla y envía a Telegram."
  },
  technical: {
    id: "view-technical",
    title: "Panel técnico",
    description: "Configuración, pruebas y diagnóstico del sistema."
  }
};

const TECH_ACCESS_KEY = "Ni72da12";

const state = {
  templates: [],
  selectedTemplateId: "",
  selectedTemplateText: ""
};

const SEND_BUTTON_DEFAULT_TEXT = "Enviar a Telegram";

let technicalUnlocked = sessionStorage.getItem("technical_unlocked") === "1";

dashboardTokenInput.value = localStorage.getItem("dashboard_token") || "";

function getHeaders() {
  const token = localStorage.getItem("dashboard_token") || "";
  const headers = { "content-type": "application/json" };
  if (token) {
    headers["x-dashboard-token"] = token;
  }
  return headers;
}

async function callApi(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    parsed = text;
  }

  output.textContent = JSON.stringify(
    {
      status: response.status,
      data: parsed
    },
    null,
    2
  );

  return { status: response.status, data: parsed };
}

function setStatus(target, text, type) {
  target.className = type;
  target.textContent = text;
}

function switchView(viewKey) {
  const target = views[viewKey];
  if (!target) return;

  Object.values(views).forEach((view) => {
    document.getElementById(view.id).classList.remove("active");
  });
  document.getElementById(target.id).classList.add("active");

  Array.from(navButtons.querySelectorAll("button")).forEach((button) => {
    const active = button.getAttribute("data-view") === viewKey;
    button.classList.toggle("active", active);
  });

  headerTitle.textContent = target.title;
  headerDescription.textContent = target.description;
}

function getSelectedTemplate() {
  return state.templates.find((item) => item.id === state.selectedTemplateId) || null;
}

function renderPreview() {
  const template = getSelectedTemplate();
  const text = template ? template.text : "Selecciona una plantilla";
  const link = simplePostUrl.value.trim();
  userPreview.textContent = link ? text + "\n\n" + link : text;
}

async function loadTemplates() {
  const result = await callApi("/.netlify/functions/dashboard-send");
  if (!result.data || !result.data.ok || !Array.isArray(result.data.templates)) {
    setStatus(settingsStatus, "No se pudieron cargar plantillas.", "status-danger");
    return;
  }

  state.templates = result.data.templates;
  simpleTemplateSelect.innerHTML = "";

  result.data.templates.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    simpleTemplateSelect.appendChild(option);
  });

  if (state.templates.length) {
    state.selectedTemplateId = state.templates[0].id;
    state.selectedTemplateText = state.templates[0].text;
    simpleTemplateSelect.value = state.selectedTemplateId;
    selectedTemplateChip.textContent = "Plantilla: " + state.templates[0].label;
    setStatus(simpleStatus, "Plantilla lista para envío.", "status-ok");
    renderPreview();
  }

  setStatus(settingsStatus, "Plantillas cargadas correctamente.", "status-ok");
}

async function loadStatusSummary() {
  const result = await callApi("/.netlify/functions/dashboard-config");
  const data = result.data || {};

  const tokenOk = data && data.configured && data.configured.TELEGRAM_BOT_TOKEN;
  const chatOk = data && data.configured && data.configured.TELEGRAM_CHAT_ID;

  document.getElementById("techKpiToken").textContent = tokenOk ? "Configurado" : "Falta";
  document.getElementById("techKpiChat").textContent = chatOk ? "Configurado" : "Falta";
  document.getElementById("techKpiState").textContent = data.ok ? "Listo" : "Pendiente";
}

async function sendSimpleMessage() {
  const templateId = simpleTemplateSelect.value;
  const postUrl = simplePostUrl.value.trim();

  if (!templateId) {
    setStatus(simpleStatus, "Selecciona una plantilla.", "status-warn");
    return;
  }
  if (!postUrl) {
    setStatus(simpleStatus, "Ingresa el link de Instagram.", "status-warn");
    return;
  }

  simpleSend.disabled = true;
  simpleSend.textContent = "Enviando...";

  try {
    const result = await callApi("/.netlify/functions/dashboard-send", {
      method: "POST",
      body: JSON.stringify({
        templateId,
        postUrl
      })
    });

    if (result.status >= 200 && result.status < 300 && result.data && result.data.ok) {
      setStatus(simpleStatus, "Mensaje enviado correctamente a Telegram.", "status-ok");
      simpleSend.textContent = "Enviado con exito";
    } else {
      setStatus(simpleStatus, (result.data && result.data.error) || "No se pudo enviar el mensaje.", "status-danger");
      simpleSend.textContent = "Error al enviar";
    }
  } catch (_) {
    setStatus(simpleStatus, "Error de red al enviar el mensaje.", "status-danger");
    simpleSend.textContent = "Error al enviar";
  } finally {
    simpleSend.disabled = false;
    window.setTimeout(() => {
      simpleSend.textContent = SEND_BUTTON_DEFAULT_TEXT;
    }, 2500);
  }
}

navButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;

  const targetView = button.getAttribute("data-view");
  if (targetView === "technical" && !technicalUnlocked) {
    const provided = window.prompt("Ingresa la clave para acceder a Técnico:", "") || "";
    if (provided !== TECH_ACCESS_KEY) {
      setStatus(simpleStatus, "Clave técnica incorrecta.", "status-danger");
      return;
    }

    technicalUnlocked = true;
    sessionStorage.setItem("technical_unlocked", "1");
  }

  switchView(targetView);
});

document.getElementById("saveToken").addEventListener("click", () => {
  localStorage.setItem("dashboard_token", dashboardTokenInput.value.trim());
  setStatus(settingsStatus, "Token guardado en el navegador.", "status-ok");
  output.textContent = "Token guardado en el navegador.";
});

simpleSend.addEventListener("click", sendSimpleMessage);

document.getElementById("refreshStatus").addEventListener("click", async () => {
  await loadStatusSummary();
});

document.getElementById("sendTest").addEventListener("click", async () => {
  const result = await callApi("/.netlify/functions/dashboard-test", { method: "POST" });
  if (result.status >= 200 && result.status < 300 && result.data && result.data.ok) {
    setStatus(settingsStatus, "Mensaje de prueba enviado correctamente.", "status-ok");
  } else {
    setStatus(settingsStatus, (result.data && result.data.error) || "Error enviando mensaje de prueba.", "status-danger");
  }
});

document.getElementById("reloadTemplates").addEventListener("click", async () => {
  await loadTemplates();
});

simpleTemplateSelect.addEventListener("change", () => {
  state.selectedTemplateId = simpleTemplateSelect.value;
  const selected = getSelectedTemplate();
  if (selected) {
    selectedTemplateChip.textContent = "Plantilla: " + selected.label;
  }
  renderPreview();
});

simplePostUrl.addEventListener("input", renderPreview);

async function init() {
  await loadTemplates();
  await loadStatusSummary();
  switchView("send");
}

init().catch((error) => {
  output.textContent = JSON.stringify(
    {
      status: 500,
      data: { ok: false, error: "Error inicializando app: " + error.message }
    },
    null,
    2
  );
});

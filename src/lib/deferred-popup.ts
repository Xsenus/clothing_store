const POPUP_PLACEHOLDER_HTML = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Авторизация...</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f8fafc;
      color: #111827;
      font-family: Arial, sans-serif;
    }
    .card {
      padding: 20px 24px;
      border-radius: 16px;
      background: #ffffff;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
      font-size: 14px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="card">Открываем страницу авторизации...</div>
</body>
</html>`;

export const openDeferredPopup = (
  name: string,
  features = "width=540,height=720",
) => {
  if (typeof window === "undefined") {
    return null;
  }

  const popup = window.open("about:blank", name, features);
  if (!popup) {
    return null;
  }

  try {
    popup.document.write(POPUP_PLACEHOLDER_HTML);
    popup.document.close();
    popup.focus();
  } catch {}

  return popup;
};

export const navigateDeferredPopup = (popup: Window | null, url: string) => {
  if (!popup || popup.closed) {
    return false;
  }

  try {
    popup.location.replace(url);
    popup.focus();
    return true;
  } catch {
    try {
      popup.location.href = url;
      popup.focus();
      return true;
    } catch {
      return false;
    }
  }
};

export const closeDeferredPopup = (popup: Window | null) => {
  if (!popup || popup.closed) {
    return;
  }

  try {
    popup.close();
  } catch {}
};

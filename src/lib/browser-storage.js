const getStorage = (type) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return type === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

export const getBrowserStorageItem = (key, type = "local") => {
  const storage = getStorage(type);
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const setBrowserStorageItem = (key, value, type = "local") => {
  const storage = getStorage(type);
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeBrowserStorageItem = (key, type = "local") => {
  const storage = getStorage(type);
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

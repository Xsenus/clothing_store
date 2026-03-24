let sonnerModulePromise = null;

const getToastApi = async () => {
  sonnerModulePromise ??= import("sonner");
  const { toast } = await sonnerModulePromise;
  return toast;
};

const runToast = (method, message, options) => {
  void getToastApi().then((toast) => {
    const handler = typeof toast[method] === "function" ? toast[method] : toast;
    handler(message, options);
  });
};

export const notify = {
  success(message, options) {
    runToast("success", message, options);
  },
  error(message, options) {
    runToast("error", message, options);
  },
  info(message, options) {
    runToast("info", message, options);
  },
  message(message, options) {
    runToast("message", message, options);
  },
};

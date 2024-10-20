// services/cdsbot/src/utils/task-manager.js

export function cancelRunningTasks (taskOrPromise, cb) {
  cb ||= () => undefined;
  let isCancelled = false;
  const cancellationPromise = new Promise((resolve, reject) => {
    isCancelled = true;
    reject(new Error('Task cancelled'));
  });

  const wrappedTask = async () => {
    try {
      if (typeof taskOrPromise === 'function') {
        await taskOrPromise();
      } else {
        await taskOrPromise;
      }
    } catch (error) {
      if (isCancelled) {
        console.log('Task was cancelled');
      } else {
        throw error;
      }
    }
  };

  Promise
    .race([wrappedTask(), cancellationPromise])
    .then(() => cb())
    .catch((error) => cb(error));

  return () => {
    isCancelled = true;
  };
}

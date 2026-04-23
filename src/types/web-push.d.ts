declare module 'web-push' {
  interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  interface SendResult {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }

  interface WebPushError extends Error {
    statusCode: number;
  }

  function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  function sendNotification(subscription: PushSubscription, payload: string, options?: any): Promise<SendResult>;
  function generateVAPIDKeys(): { publicKey: string; privateKey: string };
}

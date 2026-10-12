declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, unknown>): void;

declare const wx: {
  login(options: {
    success(result: { code: string }): void;
    fail(): void;
  }): void;
  request(options: {
    url: string;
    method: "GET" | "POST";
    header?: Record<string, string>;
    data?: Record<string, string | number>;
    success(result: { statusCode: number; data: unknown }): void;
    fail(): void;
  }): void;
  setStorageSync(key: string, value: string): void;
  getStorageSync(key: string): string | undefined;
  navigateTo(options: { url: string }): void;
  requestPayment(options: {
    timeStamp: string; nonceStr: string; package: string; signType: "RSA"; paySign: string;
    success(): void; fail(result: { errMsg?: string }): void;
  }): void;
  downloadFile(options: {
    url: string; header?: Record<string, string>;
    success(result: { statusCode: number; tempFilePath: string }): void; fail(): void;
  }): void;
  showModal(options: {
    title: string; content?: string; editable?: boolean; placeholderText?: string;
    success(result: { confirm: boolean; content?: string }): void;
  }): void;
};

declare module "africastalking" {
  interface ATOptions {
    apiKey: string;
    username: string;
  }

  interface SMSRecipient {
    statusCode: number;
    number: string;
    status: string;
    cost: string;
    messageId: string;
    messageParts: number;
  }

  interface SMSResponse {
    SMSMessageData: {
      Message: string;
      Recipients: SMSRecipient[];
    };
  }

  interface SMSSendOptions {
    to: string[];
    message: string;
    from?: string;
    enqueue?: boolean;
  }

  interface SMS {
    send(options: SMSSendOptions): Promise<SMSResponse>;
  }

  interface AfricasTalkingInstance {
    SMS: SMS;
  }

  function AfricasTalking(options: ATOptions): AfricasTalkingInstance;
  export = AfricasTalking;
}

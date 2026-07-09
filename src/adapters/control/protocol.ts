export type ChannelRuntimeState = 'disabled' | 'ready' | 'starting' | 'running' | 'failed';

export interface DaemonStatus {
  ok: boolean;
  pid: number;
  startedAt: string;
  channels: {
    feishu: ChannelRuntimeState;
    wechat: ChannelRuntimeState;
  };
  uncleanRestart?: boolean;
}

export type ControlRequest = {
  id: string;
  method: 'status';
};

export type ControlResponse =
  | {
      id: string;
      ok: true;
      result: DaemonStatus;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

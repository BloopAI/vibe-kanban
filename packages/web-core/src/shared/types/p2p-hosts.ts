export type P2pHost = {
  id: string;
  name: string;
  address: string;
  relay_port: number;
  machine_id: string;
  session_token: string | null;
  status: string; // 'pending' | 'paired'
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
  ssh_user: string | null;
  ssh_port: number;
  ssh_key_path: string | null;
  connection_mode: string; // 'direct' | 'ssh' | 'auto'
  known_host_key: string | null;
};

export type CreateP2pHostRequest = {
  name: string;
  address: string;
  relay_port?: number;
  pairing_code: string;
};

export type SshPairRequest = {
  name: string;
  address: string;
  ssh_port: number;
  ssh_user: string;
  ssh_key_path: string;
  relay_port?: number;
};

export type SshPairResponse = {
  host_id: string;
  session_token: string;
  host_key_fingerprint: string;
};

export type UpdateSshConfigRequest = {
  ssh_user?: string;
  ssh_port?: number;
  ssh_key_path?: string;
  connection_mode?: 'direct' | 'ssh' | 'auto';
};

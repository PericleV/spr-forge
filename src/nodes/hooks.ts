import { useNodeConnections } from '@xyflow/react';

export const useConnected = (handleId: string) => useNodeConnections({ handleType: 'target', handleId }).length > 0;

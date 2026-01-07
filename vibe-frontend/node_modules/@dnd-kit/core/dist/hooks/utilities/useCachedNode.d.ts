import type { DraggableNode, DraggableNodes } from '../../store';
import type { UniqueIdentifier } from '../../types';
export declare function useCachedNode(draggableNodes: DraggableNodes, id: UniqueIdentifier | null): DraggableNode['node']['current'];

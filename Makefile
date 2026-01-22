K3D_CLUSTER ?= pet
KUBE_NAMESPACE ?= vibe-kanban
VK_IMAGE ?= vibe-kanban:local

.PHONY: vk-build vk-import vk-restart vk-rebuild

vk-build:
	docker build -t $(VK_IMAGE) .

vk-import:
	k3d image import $(VK_IMAGE) -c $(K3D_CLUSTER)

vk-restart:
	kubectl -n $(KUBE_NAMESPACE) rollout restart deploy/vibe-kanban

vk-rebuild: vk-build vk-import vk-restart

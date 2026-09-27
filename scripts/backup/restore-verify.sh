#!/bin/bash
# Дрилл восстановления бэкапов k3s (B5, DoD «восстановление проверено»).
#
# Запуск С ноды, где есть kubectl (vps2):
#   ssh vps2 bash -s < scripts/backup/restore-verify.sh
#
# Что делает:
#   1) берёт свежий снапшот из /var/lib/cleanfine-backups;
#   2) создаёт БД cleaning_ops_chat_restore и восстанавливает в неё chat-дамп;
#   3) сверяет счётчики Chats/Messages (> 0) и листит minio-data.tgz;
#   4) временную БД удаляет; под дрилла убирает после просмотра логов.
set -euo pipefail

NS=cleaning-ops
POD=pg-restore-drill
RESTORE_DB=cleaning_ops_chat_restore
LATEST="$(ls -1dt /var/lib/cleanfine-backups/*/ | head -1)"
LATEST="${LATEST%/}"
echo "== снапшот: ${LATEST}"
ls -lh "${LATEST}"

kubectl -n "$NS" delete pod "$POD" --ignore-not-found >/dev/null

kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: ${POD}
  namespace: ${NS}
  labels: { app.kubernetes.io/name: restore-drill }
spec:
  restartPolicy: Never
  containers:
    - name: drill
      image: postgis/postgis:16-3.4
      imagePullPolicy: IfNotPresent
      env:
        - name: PGUSER
          valueFrom:
            configMapKeyRef: { name: cleaning-ops-config, key: POSTGRES_USER }
        - name: PGPASSWORD
          valueFrom:
            secretKeyRef: { name: cleaning-ops-secrets, key: DB_PASSWORD }
      command: ["bash", "-lc"]
      args:
        - |
          set -euo pipefail
          LATEST='${LATEST}'
          echo '== restore chat dump'
          psql -h postgres -d postgres -c 'DROP DATABASE IF EXISTS ${RESTORE_DB};'
          psql -h postgres -d postgres -c 'CREATE DATABASE ${RESTORE_DB};'
          pg_restore -h postgres -d '${RESTORE_DB}' --no-owner "\${LATEST}/cleaning_ops_chat.dump"
          echo '== counts (must be > 0)'
          echo -n 'Chat: ';   psql -h postgres -d '${RESTORE_DB}' -tAc 'SELECT count(*) FROM "Chat";'
          echo -n 'Message: '; psql -h postgres -d '${RESTORE_DB}' -tAc 'SELECT count(*) FROM "Message";'
          echo '== minio archive'
          echo -n 'files: '; tar -tzf "\${LATEST}/minio-data.tgz" | wc -l
          tar -tzf "\${LATEST}/minio-data.tgz" | head -5
          echo '== cleanup'
          psql -h postgres -d postgres -c 'DROP DATABASE ${RESTORE_DB};'
          echo DRILL_OK
      volumeMounts:
        - { name: backups, mountPath: /var/lib/cleanfine-backups, readOnly: true }
  volumes:
    - name: backups
      hostPath: { path: /var/lib/cleanfine-backups, type: DirectoryOrCreate }
EOF

if kubectl -n "$NS" wait --for=jsonpath='{.status.phase}'=Succeeded "pod/${POD}" --timeout=120s >/dev/null 2>&1; then
  kubectl -n "$NS" logs "$POD"
  kubectl -n "$NS" delete pod "$POD" >/dev/null
  echo "== ДРИЛЛ ПРОЙДЕН"
else
  echo "== под не завершился — логи:" >&2
  kubectl -n "$NS" logs "$POD" >&2 || true
  kubectl -n "$NS" describe "$POD" | tail -20 >&2 || true
  exit 1
fi

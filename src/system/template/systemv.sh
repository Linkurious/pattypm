#!/bin/bash
### BEGIN INIT INFO
# Provides:          {{label}}
# Required-Start:    $network
# Required-Stop:     $network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: {{name}}
# Description:       {{name}}
### END INIT INFO

USER={{username}}

export PPM_CONFIG_PATH={{ppm_config_path}}
export PATH=$PATH:/usr/bin

super() {
#  PATH='$PATH' PPM_CONFIG_PATH='$PPM_CONFIG_PATH'
  $*
#  if [[ -x "$(which runusera)" ]]; then
#    runuser -l ${USER} -c "$CMD"
#  else
#    su - ${USER} -c "$CMD"
#  fi
}

start() {
  echo "Starting {{name}}"
  super {{node_path}} {{ppm_client_path}} start --from-service
}

stop() {
  echo "Stopping {{name}}"
  super {{node_path}} {{ppm_client_path}} stop --from-service
}

reload() {
  echo "Reloading {{name}}"
  super {{node_path}} {{ppm_client_path}} restart --from-service
}

status() {
  echo "Status for {{name}}"
  super {{node_path}} {{ppm_client_path}} status --from-service
}

case "$1" in
  start)
    start
    ;;
  status)
    status
    ;;
  stop)
    stop
    ;;
  reload|force-reload|restart)
    restart
    ;;
  *)
    echo "Usage: $0 start|stop|restart|status" >&2
    exit 3
    ;;
esac


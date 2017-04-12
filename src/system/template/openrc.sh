#!/sbin/openrc-run

extra_started_commands="reload"

USER={{username}}
PPM_CONFIG_PATH={{ppm_config_path}}

super() {
    su - $USER -c "PATH=$PATH; PPM_CONFIG_PATH=$PPM_CONFIG_PATH $* --from-service"
}

depend() {
	use net localmount
	after bootmisc
}

start() {
	ebegin "Starting {{name}}"

	super {{node_path}} {{ppm_client_path}} start

	eend $?
}

stop() {
	ebegin "Stopping {{name}}"

	super {{node_path}} {{ppm_client_path}} stop

	eend $?
}

reload() {
	ebegin "Reloading {{name}}"

	super {{node_path}} {{ppm_client_path}} restart

	eend $?
}

status() {
	ebegin "Status for Linkurious"

	super {{node_path}} {{ppm_client_path}} status

	eend $?
}

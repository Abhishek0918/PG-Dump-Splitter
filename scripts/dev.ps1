param(
    [string]$HostName = "127.0.0.1",
    [int]$Port = 8091
)

$ErrorActionPreference = "Stop"
python -m pgsplit serve --host $HostName --port $Port

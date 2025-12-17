Write-Host "Building and deploying duty scheduler..." -ForegroundColor Green

Write-Host "Building client image..." -ForegroundColor Yellow
docker build -t nirberkovich/duty-scheduler-client:latest ./client

Write-Host "Building server image..." -ForegroundColor Yellow
docker build -t nirberkovich/duty-scheduler-server:latest ./server

Write-Host "Pushing client image to Docker Hub..." -ForegroundColor Yellow
docker push nirberkovich/duty-scheduler-client:latest

Write-Host "Pushing server image to Docker Hub..." -ForegroundColor Yellow
docker push nirberkovich/duty-scheduler-server:latest

Write-Host "Waiting 5 seconds before restarting containers..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "Restarting server container app..." -ForegroundColor Yellow
az containerapp update --name client --resource-group Nir --set-env-vars RESTART_AT=$(date +%s)

Write-Host "Restarting client container app..." -ForegroundColor Yellow
az containerapp update --name client --resource-group Nir --set-env-vars RESTART_AT=$(date +%s)

Write-Host "Deployment completed!" -ForegroundColor Green

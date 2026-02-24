FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY backend/Store.Api/Store.Api.csproj backend/Store.Api/
RUN dotnet restore backend/Store.Api/Store.Api.csproj
COPY backend/Store.Api/ backend/Store.Api/
RUN dotnet publish backend/Store.Api/Store.Api.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8000
ENV ASPNETCORE_URLS=http://0.0.0.0:8000
ENTRYPOINT ["dotnet", "Store.Api.dll"]

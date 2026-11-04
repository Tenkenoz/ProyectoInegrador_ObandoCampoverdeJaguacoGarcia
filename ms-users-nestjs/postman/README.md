# Colección Postman de AUTH

Archivos:

- `AUTH.postman_collection.json`: flujo T02, T05, T06, T07 y T12.
- `AUTH.local.postman_environment.json`: ambiente local con placeholders.

## Importar

1. Abrir Postman.
2. `Import` → seleccionar los dos archivos JSON.
3. Elegir el ambiente `AUTH local`.
4. Editar el ambiente y completar:
   - `baseUrl`: `http://127.0.0.1:3101` para el entorno Podman de prueba, o
     `http://localhost:3001` para el arranque normal.
   - `adminPassword`: contraseña del usuario `admin`.
   - `userPassword`: contraseña de los usuarios desechables creados por la
     colección.
   - `authServiceSecret`: secreto HMAC de 64 caracteres hexadecimales.

El ambiente **no contiene secretos reales**. Los placeholders deben reemplazarse
localmente y no deben subirse a Git.

## Ejecución

Ejecutar la colección completa en orden con el **Collection Runner**:

1. `00 - Health and JWKS`
2. `01 - T02 Authentication`
3. `02 - Setup users and roles`
4. `03 - T05 N:M assignments`
5. `04 - T06 Duplicate assignment`
6. `05 - T07 Revocation`
7. `06 - Internal authorization (HMAC)`
8. `07 - T12 Audit`
9. `08 - Logout`
10. `09 - Negative checks`

La carpeta `02` crea usuarios desechables con un sufijo aleatorio. La carpeta
`03` asigna roles; `04` intenta duplicar una asignación; `05` retira `ADMIN` y
reutiliza el JWT; `06` firma el cuerpo con HMAC; `07` consulta la auditoría;
`08` invalida el token con logout.

## Regla de rate limiting

El login tiene un límite de 5 intentos por minuto. Una ejecución completa usa 4
inicios de sesión. Si se ejecuta la colección dos veces seguidas, el servidor
puede devolver `429`. Esperar 60 segundos o reiniciar AUTH antes de repetir.

## Newman

También se puede ejecutar sin la interfaz:

```bash
newman run AUTH.postman_collection.json \
  -e AUTH.local.postman_environment.json
```

Para una ejecución local con los valores de prueba, crear una copia temporal del
ambiente fuera del repositorio y completar los secretos.

## Evidencias

Guardar capturas con:

- método y URL visibles;
- headers relevantes;
- body de solicitud;
- body de respuesta;
- código HTTP;
- request ID cuando aplique.

Para T12, la captura debe mostrar `GET /api/v1/audit-events` con respuesta
`200`, eventos de login, roles, decisiones y sin JWT ni contraseñas.

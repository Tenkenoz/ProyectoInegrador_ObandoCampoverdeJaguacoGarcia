# Guía de pruebas de endpoints

## 1. Health check

```http
GET http://localhost:3001/api/v1/health
```

No requiere token.

Respuesta:

```json
{
  "status": "ok",
  "service": "user-service"
}
```

## 2. Login ADMIN

```http
POST http://localhost:3001/api/v1/auth/login
Content-Type: application/json
```

```json
{
  "identifier": "jperez",
  "password": "ClaveSegura2026!"
}
```

Respuesta:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "UUID-USUARIO",
    "username": "jperez",
    "email": "jperez@example.com",
    "roles": [
      "ADMIN"
    ]
  }
}
```

También puedes iniciar sesión con email:

```json
{
  "identifier": "jperez@example.com",
  "password": "ClaveSegura2026!"
}
```

## 3. Consultar usuario autenticado

```http
GET http://localhost:3001/api/v1/auth/me
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```json
{
  "userId": "UUID-USUARIO",
  "username": "jperez",
  "email": "jperez@example.com",
  "roles": [
    "ADMIN"
  ]
}
```

## 4. Cerrar sesión

```http
POST http://localhost:3001/api/v1/auth/logout
Authorization: Bearer TOKEN_ADMIN
```

No lleva body.

Respuesta:

```http
204 No Content
```

Después de esto, el mismo JWT debe quedar inválido debido al cambio de `token_version`.

## Usuarios

### 5. Crear usuario

```http
POST http://localhost:3001/api/v1/users
Authorization: Bearer TOKEN_ADMIN
Content-Type: application/json
```

```json
{
  "cedula": "1712345678",
  "nombres": "Pedro Andrés",
  "apellidos": "Salazar Torres",
  "fechaNacimiento": "1993-04-18",
  "username": "psalazar",
  "email": "psalazar@example.com",
  "telefono": "0987654321",
  "password": "ClaveSegura2026!",
  "estado": true
}
```

Respuesta aproximada:

```json
{
  "id": "b52a7c46-7391-482b-9151-e109cd0f6ea6",
  "cedula": "1712345678",
  "nombres": "Pedro Andrés",
  "apellidos": "Salazar Torres",
  "fechaNacimiento": "1993-04-18",
  "username": "psalazar",
  "email": "psalazar@example.com",
  "telefono": "0987654321",
  "estado": true,
  "version": 1,
  "fechaCreacion": "2026-10-23T20:00:00.000Z",
  "fechaActualizacion": "2026-10-23T20:00:00.000Z",
  "fechaEliminacion": null
}
```

La contraseña no debe aparecer.

### 6. Listar usuarios

```http
GET http://localhost:3001/api/v1/users?page=1&limit=10
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```json
{
  "data": [
    {
      "id": "UUID-USUARIO",
      "cedula": "1712345675",
      "nombres": "Juan Carlos",
      "apellidos": "Pérez López",
      "username": "jperez",
      "email": "jperez@example.com",
      "telefono": "0991000001",
      "estado": true,
      "userRoles": [
        {
          "role": {
            "id": "UUID-ROL-ADMIN",
            "rol": "ADMIN",
            "estado": true
          }
        }
      ]
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1
  }
}
```

También:

```http
GET http://localhost:3001/api/v1/users?page=2&limit=2
Authorization: Bearer TOKEN_ADMIN
```

### 7. Consultar usuario por UUID

```http
GET http://localhost:3001/api/v1/users/b52a7c46-7391-482b-9151-e109cd0f6ea6
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```json
{
  "id": "b52a7c46-7391-482b-9151-e109cd0f6ea6",
  "cedula": "1712345678",
  "nombres": "Pedro Andrés",
  "apellidos": "Salazar Torres",
  "username": "psalazar",
  "email": "psalazar@example.com",
  "telefono": "0987654321",
  "estado": true
}
```

### 8. Consultar usuario por cédula

```http
GET http://localhost:3001/api/v1/users/cedula/1712345678
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```json
{
  "id": "b52a7c46-7391-482b-9151-e109cd0f6ea6",
  "cedula": "1712345678",
  "nombres": "Pedro Andrés",
  "apellidos": "Salazar Torres",
  "username": "psalazar",
  "email": "psalazar@example.com"
}
```

### 9. Actualizar usuario

```http
PATCH http://localhost:3001/api/v1/users/b52a7c46-7391-482b-9151-e109cd0f6ea6
Authorization: Bearer TOKEN_ADMIN
Content-Type: application/json
```

Ejemplo parcial:

```json
{
  "nombres": "Pedro Alejandro",
  "telefono": "0998877665",
  "estado": true
}
```

También puedes cambiar la contraseña:

```json
{
  "password": "NuevaClaveSegura2026!"
}
```

El servicio debe volver a generar el hash Argon2id.

Respuesta:

```json
{
  "id": "b52a7c46-7391-482b-9151-e109cd0f6ea6",
  "nombres": "Pedro Alejandro",
  "telefono": "0998877665",
  "estado": true
}
```

### 10. Eliminar usuario

```http
DELETE http://localhost:3001/api/v1/users/b52a7c46-7391-482b-9151-e109cd0f6ea6
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```http
204 No Content
```

Como implementaste `softDelete`, PostgreSQL conserva el registro:

```text
fecha_eliminacion = fecha actual
```

## Roles

### 11. Crear rol

```http
POST http://localhost:3001/api/v1/roles
Authorization: Bearer TOKEN_ADMIN
Content-Type: application/json
```

```json
{
  "rol": "SUPERVISOR",
  "estado": true
}
```

Respuesta:

```json
{
  "id": "55feb48c-2527-4881-91c2-40882f881c38",
  "rol": "SUPERVISOR",
  "estado": true,
  "version": 1,
  "fechaCreacion": "2026-10-23T20:10:00.000Z"
}
```

### 12. Listar roles

```http
GET http://localhost:3001/api/v1/roles?page=1&limit=20
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```json
{
  "data": [
    {
      "id": "UUID-ADMIN",
      "rol": "ADMIN",
      "estado": true
    },
    {
      "id": "UUID-CLIENTE",
      "rol": "CLIENTE",
      "estado": true
    },
    {
      "id": "UUID-OPERADOR",
      "rol": "OPERADOR",
      "estado": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

### 13. Consultar rol por UUID

```http
GET http://localhost:3001/api/v1/roles/55feb48c-2527-4881-91c2-40882f881c38
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```json
{
  "id": "55feb48c-2527-4881-91c2-40882f881c38",
  "rol": "SUPERVISOR",
  "estado": true,
  "version": 1
}
```

### 14. Actualizar rol

```http
PATCH http://localhost:3001/api/v1/roles/55feb48c-2527-4881-91c2-40882f881c38
Authorization: Bearer TOKEN_ADMIN
Content-Type: application/json
```

```json
{
  "rol": "SUPERVISOR_GENERAL",
  "estado": true
}
```

O para desactivar:

```json
{
  "estado": false
}
```

Respuesta:

```json
{
  "id": "55feb48c-2527-4881-91c2-40882f881c38",
  "rol": "SUPERVISOR_GENERAL",
  "estado": true
}
```

### 15. Eliminar rol

```http
DELETE http://localhost:3001/api/v1/roles/55feb48c-2527-4881-91c2-40882f881c38
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```http
204 No Content
```

## Relación usuario-rol

Para estos ejemplos supongamos:

```text
USER_ID = b52a7c46-7391-482b-9151-e109cd0f6ea6

ROLE_ID = 55feb48c-2527-4881-91c2-40882f881c38
```

### 16. Asignar rol a usuario

```http
POST http://localhost:3001/api/v1/user-roles
Authorization: Bearer TOKEN_ADMIN
Content-Type: application/json
```

```json
{
  "userId": "b52a7c46-7391-482b-9151-e109cd0f6ea6",
  "roleId": "55feb48c-2527-4881-91c2-40882f881c38"
}
```

Respuesta:

```json
{
  "userId": "b52a7c46-7391-482b-9151-e109cd0f6ea6",
  "roleId": "55feb48c-2527-4881-91c2-40882f881c38",
  "estado": true,
  "version": 1,
  "fechaAsignacion": "2026-10-23T20:20:00.000Z"
}
```

La asignación se guarda físicamente en:

```text
user_roles
```

### 17. Consultar roles de un usuario

```http
GET http://localhost:3001/api/v1/user-roles/user/b52a7c46-7391-482b-9151-e109cd0f6ea6
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```json
[
  {
    "userId": "b52a7c46-7391-482b-9151-e109cd0f6ea6",
    "roleId": "55feb48c-2527-4881-91c2-40882f881c38",
    "estado": true,
    "fechaAsignacion": "2026-10-23T20:20:00.000Z",
    "role": {
      "id": "55feb48c-2527-4881-91c2-40882f881c38",
      "rol": "SUPERVISOR_GENERAL",
      "estado": true
    }
  }
]
```

Este endpoint permite comprobar directamente qué roles tiene asignados el usuario.

### 18. Retirar un rol

```http
DELETE http://localhost:3001/api/v1/user-roles/b52a7c46-7391-482b-9151-e109cd0f6ea6/55feb48c-2527-4881-91c2-40882f881c38
Authorization: Bearer TOKEN_ADMIN
```

Respuesta:

```http
204 No Content
```

La relación:

```text
usuario → rol
```

deja de existir.

## Pruebas de seguridad

También conviene probar explícitamente los casos negativos.

### Sin token

```http
GET http://localhost:3001/api/v1/users
```

Esperado:

```http
401 Unauthorized
```

### Con token de CLIENTE

```http
GET http://localhost:3001/api/v1/users
Authorization: Bearer TOKEN_CLIENTE
```

Esperado:

```http
403 Forbidden
```

### Con token de OPERADOR

```http
GET http://localhost:3001/api/v1/users
Authorization: Bearer TOKEN_OPERADOR
```

Esperado:

```http
200 OK
```

Pero si el mismo OPERADOR intenta:

```http
POST http://localhost:3001/api/v1/users
Authorization: Bearer TOKEN_OPERADOR
Content-Type: application/json
```

debe obtener:

```http
403 Forbidden
```

porque crear usuarios requiere:

```text
@Roles('ADMIN')
```

Finalmente, la prueba de logout:

```http
POST http://localhost:3001/api/v1/auth/logout
Authorization: Bearer TOKEN_ADMIN
```

y luego reutilizar el mismo token:

```http
GET http://localhost:3001/api/v1/users
Authorization: Bearer TOKEN_ADMIN_ANTERIOR
```

debe retornar:

```http
401 Unauthorized
```

porque `JWT.tokenVersion` ya no coincide con `users.token_version`.
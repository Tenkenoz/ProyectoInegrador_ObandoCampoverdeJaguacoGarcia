# Endpoints disponibles
El prefijo general es:  
`http://localhost:3001/api/v1`

| # | Método | Endpoint | Descripción | Seguridad | Rol requerido |
|---:|---|---|---|---|---|
| 1 | `GET` | `/health` | Verifica el estado del microservicio | Público | — |
| 2 | `POST` | `/auth/login` | Inicia sesión y genera JWT | Público + Rate Limit | — |
| 3 | `GET` | `/auth/me` | Obtiene usuario autenticado y roles actuales | JWT | Cualquier usuario autenticado |
| 4 | `POST` | `/auth/logout` | Cierra sesión e invalida los JWT anteriores | JWT | Cualquier usuario autenticado |
| 5 | `POST` | `/users` | Crea un usuario | JWT + RBAC | ADMIN |
| 6 | `GET` | `/users?page=1&limit=20` | Lista usuarios con paginación | JWT + RBAC | ADMIN, OPERADOR |
| 7 | `GET` | `/users/:id` | Busca usuario por UUID | JWT + RBAC | ADMIN, OPERADOR |
| 8 | `GET` | `/users/cedula/:cedula` | Busca usuario por cédula | JWT + RBAC | ADMIN, OPERADOR |
| 9 | `PATCH` | `/users/:id` | Actualiza un usuario | JWT + RBAC | ADMIN |
| 10 | `DELETE` | `/users/:id` | Eliminación lógica del usuario | JWT + RBAC | ADMIN |
| 11 | `POST` | `/roles` | Crea un rol | JWT + RBAC | ADMIN |
| 12 | `GET` | `/roles?page=1&limit=20` | Lista los roles | JWT + RBAC | ADMIN, OPERADOR |
| 13 | `GET` | `/roles/:id` | Consulta un rol por UUID | JWT + RBAC | ADMIN, OPERADOR |
| 14 | `PATCH` | `/roles/:id` | Actualiza un rol | JWT + RBAC | ADMIN |
| 15 | `DELETE` | `/roles/:id` | Eliminación lógica de un rol | JWT + RBAC | ADMIN |
| 16 | `POST` | `/user-roles` | Asigna un rol a un usuario | JWT + RBAC | ADMIN |
| 17 | `GET` | `/user-roles/user/:userId` | Obtiene los roles asignados a un usuario | JWT + RBAC | ADMIN, OPERADOR |
| 18 | `DELETE` | `/user-roles/:userId/:roleId` | Retira un rol de un usuario | JWT + RBAC | ADMIN |


## Ejemplos principales

### Login

`POST /api/v1/auth/login`

```json
{
  "identifier": "jperez",
  "password": "ClaveSegura2026!"
}
```

La respuesta entrega:

```json
{
  "accessToken": "eyJhbGciOi...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "UUID",
    "username": "jperez",
    "email": "jperez@example.com",
    "roles": [
      "ADMIN"
    ]
  }
}
```

Para los demás endpoints protegidos se envía:

```http
Authorization: Bearer eyJhbGciOi...
```

### Crear usuario

```http
POST /api/v1/users
Authorization: Bearer TOKEN_ADMIN
Content-Type: application/json
```

```json
{
  "cedula": "1712345678",
  "nombres": "Juan Carlos",
  "apellidos": "Pérez López",
  "fechaNacimiento": "1990-05-15",
  "username": "jperez2",
  "email": "jperez2@example.com",
  "telefono": "0991234567",
  "password": "ClaveSegura2026!",
  "estado": true
}
```

### Asignar un rol

```http
POST /api/v1/user-roles
Authorization: Bearer TOKEN_ADMIN
Content-Type: application/json
```

```json
{
  "userId": "UUID-USUARIO",
  "roleId": "UUID-ROL"
}
```

Aquí el `roleId` debe corresponder a un registro existente de la tabla:

```text
roles
```

y la asignación queda registrada en:

```text
user_roles
```

### Cerrar sesión

```http
POST /api/v1/auth/logout
Authorization: Bearer TOKEN
```

Sin body. Respuesta:

```http
204 No Content
```

Después del logout, `token_version` del usuario aumenta y el token anterior devuelve `401 Unauthorized`.


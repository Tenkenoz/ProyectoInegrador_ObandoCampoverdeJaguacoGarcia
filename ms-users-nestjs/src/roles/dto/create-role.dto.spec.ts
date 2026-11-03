import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoleDto } from './create-role.dto.js';

async function validateRole(value: string) {
  const dto = plainToInstance(CreateRoleDto, { rol: value });
  return validate(dto);
}

describe('CreateRoleDto', () => {
  it.each(['ADMIN', 'ANALYST', 'USER'])('accepts %s', async (role) => {
    await expect(validateRole(role)).resolves.toHaveLength(0);
  });

  it('normalizes lower case role names', async () => {
    const dto = plainToInstance(CreateRoleDto, { rol: ' analyst ' });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.rol).toBe('ANALYST');
  });

  it('rejects roles outside the catalog', async () => {
    const errors = await validateRole('OPERADOR');

    expect(errors).toHaveLength(1);
  });
});

import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { CedulaPipe } from './cedula.pipe.js';

const metadata = {} as ArgumentMetadata;

describe('CedulaPipe', () => {
  const pipe = new CedulaPipe();

  it('accepts a ten digit national identification number', () => {
    expect(pipe.transform('1712345678', metadata)).toBe('1712345678');
  });

  it('rejects values with a different length', () => {
    expect(() => pipe.transform('171234567', metadata)).toThrow(
      BadRequestException,
    );
  });

  it('rejects values with non numeric characters', () => {
    expect(() => pipe.transform('17123456AB', metadata)).toThrow(
      BadRequestException,
    );
  });
});

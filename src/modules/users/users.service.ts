import { ConflictException } from '@common/exceptions/app.exception';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';

export interface CreateUserParams {
  email: string;
  displayName: string;
  passwordHash: string;
  isPlatformAdmin?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Find a user by email for authentication.
   * Explicitly selects passwordHash — it's excluded by default via select:false on the column.
   */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async create(params: CreateUserParams): Promise<User> {
    const existingUser = await this.findByEmail(params.email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const user = this.userRepo.create({
      email: params.email.toLowerCase(),
      displayName: params.displayName,
      passwordHash: params.passwordHash,
      isPlatformAdmin: params.isPlatformAdmin ?? false,
    });

    return this.userRepo.save(user);
  }
}

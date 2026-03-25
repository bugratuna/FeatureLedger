import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Organization } from './entities/organization.entity';
import { OrganizationsService } from './organizations.service';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberships: [],
    ...overrides,
  } as Organization;
}

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let orgRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    orgRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((org) => Promise.resolve({ ...org, id: 'org-new' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
      ],
    }).compile();

    service = module.get(OrganizationsService);
  });

  describe('deriveSlug', () => {
    it.each([
      ['Acme Corp', 'acme-corp'],
      ['Acme Corp & Partners!', 'acme-corp-partners'],
      ['  Leading and Trailing  ', 'leading-and-trailing'],
      ['Multiple   Spaces   Here', 'multiple-spaces-here'],
      ['UPPERCASE ORG', 'uppercase-org'],
      ['café-au-lait', 'caf-au-lait'],   // non-ASCII stripped
      ['123 Numbers First', '123-numbers-first'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(service.deriveSlug(input)).toBe(expected);
    });

    it('truncates to 100 characters', () => {
      const longName = 'a'.repeat(200);
      expect(service.deriveSlug(longName)).toHaveLength(100);
    });
  });

  describe('create', () => {
    it('uses provided slug when given', async () => {
      orgRepo.findOne.mockResolvedValue(null);
      const org = await service.create({ name: 'Acme Corp', slug: 'custom-slug' });
      expect(org.slug).toBe('custom-slug');
    });

    it('derives slug from name when not provided', async () => {
      orgRepo.findOne.mockResolvedValue(null);
      await service.create({ name: 'My New Org' });
      expect(orgRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-new-org' }),
      );
    });

    it('throws RESOURCE_CONFLICT when slug already exists', async () => {
      orgRepo.findOne.mockResolvedValue(makeOrg({ slug: 'acme-corp' }));

      await expect(
        service.create({ name: 'Acme Corp' }),
      ).rejects.toMatchObject({ errorCode: 'RESOURCE_CONFLICT' });
    });
  });
});

import { ForbiddenException } from '@nestjs/common';
import { LineItemsService } from '../../src/line-items/line-items.service';
import { LineItemsRepository } from '../../src/line-items/line-items.repository';

const repository = {
  updateWithApproval: jest.fn().mockResolvedValue({ id: 'item-1' }),
} as unknown as LineItemsRepository;

describe('LineItemsService mutation identity', () => {
  const service = new LineItemsService(repository);
  const admin = { sub: 'admin-subject', role: 'admin' as const, ownerId: 'mapped-actor' };
  const update = { expectedVersion: 1, actorId: 'spoofed-actor' } as never;

  it('rejects an administrator-supplied actor different from the mapped identity', async () => {
    await expect(service.update('item-1', update, admin)).rejects.toThrow(ForbiddenException);
    expect(repository.updateWithApproval).not.toHaveBeenCalled();
  });

  it('uses the mapped identity when the actor claim matches', async () => {
    await service.update('item-1', { expectedVersion: 1, actorId: 'mapped-actor' } as never, admin);
    expect(repository.updateWithApproval).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ actorId: 'mapped-actor' }),
      undefined,
    );
  });
});

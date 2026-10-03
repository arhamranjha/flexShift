import { Controller, Get } from '@nestjs/common';
import { DEFAULT_MARKET, MARKETS } from '../common/markets';

/** Public, static, non-sensitive: the registration page needs it before anyone has signed in. */
@Controller('markets')
export class MarketsController {
  @Get()
  list() {
    return { default: DEFAULT_MARKET, markets: Object.values(MARKETS) };
  }
}

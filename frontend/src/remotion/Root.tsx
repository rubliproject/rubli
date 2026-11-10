import { Composition, Folder } from 'remotion'
import { Relevo } from './relevo/Relevo'
import { After } from './relevo/scenes/After'
import { Buyer } from './relevo/scenes/Buyer'
import { Cliff } from './relevo/scenes/Cliff'
import { End } from './relevo/scenes/End'
import { Four } from './relevo/scenes/Four'
import { Order } from './relevo/scenes/Order'
import { Peak } from './relevo/scenes/Peak'
import { Relay } from './relevo/scenes/Relay'
import { Return } from './relevo/scenes/Return'
import { calculateRelevoMetadata, sceneMetadata } from './relevo/timing'

/** «El Relevo» in both languages, plus each beat as a connected composition (EN) for Studio. */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="RelevoEN" component={Relevo} fps={30} width={1920} height={1080} durationInFrames={2850} defaultProps={{ lang: 'en' as const }} calculateMetadata={calculateRelevoMetadata} />
    <Composition id="RelevoES" component={Relevo} fps={30} width={1920} height={1080} durationInFrames={2850} defaultProps={{ lang: 'es' as const }} calculateMetadata={calculateRelevoMetadata} />
    <Folder name="Relevo-beats">
      <Composition id="Peak" component={Peak} fps={30} width={1920} height={1080} durationInFrames={360} defaultProps={{ lang: 'en' as const }} calculateMetadata={sceneMetadata('peak')} />
      <Composition id="Four" component={Four} fps={30} width={1920} height={1080} durationInFrames={450} defaultProps={{ lang: 'en' as const }} calculateMetadata={sceneMetadata('four')} />
      <Composition id="Buyer" component={Buyer} fps={30} width={1920} height={1080} durationInFrames={180} defaultProps={{ lang: 'en' as const }} calculateMetadata={sceneMetadata('buyer')} />
      <Composition id="Relay" component={Relay} fps={30} width={1920} height={1080} durationInFrames={270} defaultProps={{ lang: 'en' as const }} calculateMetadata={sceneMetadata('relay')} />
      <Composition id="Order" component={Order} fps={30} width={1920} height={1080} durationInFrames={560} defaultProps={{ lang: 'en' as const }} calculateMetadata={sceneMetadata('order')} />
      <Composition id="Cliff" component={Cliff} fps={30} width={1920} height={1080} durationInFrames={300} defaultProps={{ lang: 'en' as const }} calculateMetadata={sceneMetadata('cliff')} />
      <Composition id="After" component={After} fps={30} width={1920} height={1080} durationInFrames={300} defaultProps={{ lang: 'en' as const }} calculateMetadata={sceneMetadata('after')} />
      <Composition id="Return" component={Return} fps={30} width={1920} height={1080} durationInFrames={390} defaultProps={{ lang: 'en' as const }} calculateMetadata={sceneMetadata('return')} />
      <Composition id="End" component={End} fps={30} width={1920} height={1080} durationInFrames={540} defaultProps={{ lang: 'en' as const }} calculateMetadata={sceneMetadata('end')} />
    </Folder>
  </>
)

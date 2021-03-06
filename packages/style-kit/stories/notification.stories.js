import mdx from './notification.mdx';
import { story } from 'style-loader!./notification.stories.scss';
import { withKnobs, text, boolean } from '@storybook/addon-knobs';

export default {
  title: 'Notifications',
  decorators: [withKnobs],
  parameters: { docs: { page: mdx } },
};

export const notificationWithIcon = () => /*html*/ `
<div class=${story}>
  <div class="notification" style="width:400px;">
    <div class="content">
        <i>tick-circled-reverse</i>
        <span>Default notification text</span>
        <button id="close-notification"><i>cross</i></button>
    </div>
  </div>
</div>`;

export const notificationWithText = () => /*html*/ `
<div class=${story}>
  <div class="notification">
    <div class="content">
        <i>tick-circled-reverse</i>
        Default notification text
        <button id="close-notification">CANCEL</button>
    </div>
  </div>
</div>`;

export const Notifications = () => {
  const notificationText = text('Notification Text', 'Default notification text');
  const buttonText = text('Button Text', 'Cancel');
  const showIcon = boolean('Show Icon', true);
  const showClose = boolean('Show Close Icon', true);

  return /*html*/ `

<div class="${story}">

  <p>Default Notification with icon button</p>

  <div class="notification" style="width:400px;">
    <div class="content">
        ${showIcon ? `<i>tick-circled-reverse</i>` : ''}
        <span>${notificationText}</span>
        ${showClose ? `<button id="close-notification"><i>cross</i></button>` : ''}
    </div>
  </div>

  <br><br>

  <p>Default Notification with text button</p>

  <div class="notification">
    <div class="content">
        ${showIcon ? `<i>tick-circled-reverse</i>` : ''}
        ${notificationText}
        <button id="close-notification">${buttonText}</button>
    </div>
  </div>


</div>
`;
};
